// Simple SendGrid test using the provided example
import sgMail from '@sendgrid/mail';

// Use the new API key
sgMail.setApiKey('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');

const msg = {
  to: 'test@example.com', // Change to your recipient
  from: 'test@example.com', // Change to your verified sender
  subject: 'Sending with SendGrid is Fun',
  text: 'and easy to do anywhere, even with Node.js',
  html: '<strong>and easy to do anywhere, even with Node.js</strong>',
};

sgMail
  .send(msg)
  .then(() => {
    console.log('Email sent');
  })
  .catch((error) => {
    console.error(error);
  });
