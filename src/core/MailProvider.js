import nodemailer from 'nodemailer';

class MailProvider {
  constructor({ config }) {
    this.config = config;
    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure, 
      auth: {
        user: config.email.user,
        pass: config.email.password,
      },
    });
  }

  _getTemplate(type, data) {
    if (type === 'OTP') {
      return `
        <div style="font-family: Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6;">
          <h2 style="color: #333;">Verification Required</h2>
          <p>Hello,</p>
          <p>You are registering for an account. Please use the following code to complete your registration:</p>
          <div style="background: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; border-radius: 8px; margin: 20px 0;">
            ${data.otp}
          </div>
          <p>This code is valid for <strong>5 minutes</strong>.</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">If you did not request this code, please ignore this email.</p>
        </div>
      `;
    }
    return data.content; 
  }

  async sendEmail(to, subject, templateType, data) {
    try {
      const htmlContent = this._getTemplate(templateType, data);

      const info = await this.transporter.sendMail({
        from: `"${this.config.email.from}" <${this.config.email.user}>`,
        to: to,
        subject: subject,
        html: htmlContent,
      });

      console.log(`Email sent: ${info.messageId}`);
      return info;
    } catch (error) {
      console.error(' Email Service Error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
}

export default MailProvider;