const express = require('express');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const rfs = require('rotating-file-stream');
const nodemailer = require('nodemailer');

const app = express();
app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(express.json());

const ALERT_WINDOW_MS = Number(process.env.ERROR_ALERT_WINDOW_MS || 60000);
const ERROR_ALERT_THRESHOLD = Number(process.env.ERROR_ALERT_THRESHOLD || 5);
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO || '';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const CONTACT_EMAIL_TO = process.env.CONTACT_EMAIL_TO || '';
const mailTransporter = SMTP_HOST && SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    })
  : null;

const recentErrors = [];

function sendErrorSpikeAlert(errorCount) {
  if (!ALERT_EMAIL_TO || !mailTransporter) {
    console.warn('Error spike alert configured without SMTP settings. Skipping email alert.');
    return;
  }

  mailTransporter.sendMail({
    from: SMTP_FROM,
    to: ALERT_EMAIL_TO,
    subject: 'Error spike detected on SJ Infotech site',
    text: `Detected ${errorCount} errors in the last ${ALERT_WINDOW_MS / 1000} seconds. Check the app logs immediately.`
  }).then(() => {
    console.log('Error spike alert email sent.');
  }).catch((mailError) => {
    console.error('Failed to send error spike alert email:', mailError);
  });
}

function maybeTriggerErrorAlert() {
  const now = Date.now();
  recentErrors.push(now);

  while (recentErrors.length && now - recentErrors[0] > ALERT_WINDOW_MS) {
    recentErrors.shift();
  }

  if (recentErrors.length >= ERROR_ALERT_THRESHOLD) {
    sendErrorSpikeAlert(recentErrors.length);
    recentErrors.length = 0;
  }
}

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// Setup Winston logger with rotation
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true
    }),
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true
    })
  ]
});
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({ format: winston.format.simple() }));
}

// Setup morgan access logging with rotation
const accessLogStream = rfs.createStream('access.log', {
  interval: '1d',
  path: logsDir,
  maxFiles: 14,
  size: '20M',
  compress: true
});
app.use(morgan('combined', { stream: accessLogStream }));

// Rate limiter for contact endpoint
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' }
});

// Simple contact API with rate limiting and logging
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get(['/', '/Untitled-1.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/contact', contactLimiter, async (req, res) => {
  const { name, email, subject, message } = req.body || {};
  if (
    typeof name !== 'string' ||
    typeof email !== 'string' ||
    (subject !== undefined && typeof subject !== 'string') ||
    typeof message !== 'string' ||
    !name.trim() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    !message.trim() ||
    name.length > 120 ||
    email.length > 254 ||
    (subject && subject.length > 200) ||
    message.length > 10000
  ) {
    return res.status(400).json({ error: 'Please provide a valid name, email, and message.' });
  }

  if (!CONTACT_EMAIL_TO || !mailTransporter) {
    return res.status(503).json({ error: 'The contact service is temporarily unavailable.' });
  }

  try {
    await mailTransporter.sendMail({
      from: SMTP_FROM,
      to: CONTACT_EMAIL_TO,
      replyTo: email.trim(),
      subject: `Website contact: ${subject.trim() || 'New message'}`,
      text: `Name: ${name.trim()}\nEmail: ${email.trim()}\n\n${message.trim()}`
    });
    logger.info('Contact email delivered');
    return res.json({ message: 'Message received. We will contact you soon.' });
  } catch (error) {
    logger.error('Failed to deliver contact submission', { message: error.message });
    return res.status(502).json({ error: 'Unable to send your message right now. Please try again later.' });
  }
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  maybeTriggerErrorAlert();
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  logger.info(`Server running at http://localhost:${port}`);
  console.log(`Server running at http://localhost:${port}`);
});
