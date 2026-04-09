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

    if (type === 'PROJECT_APPROVED') {
      return `
        <div style="font-family: Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6; color: #333;">
          <h2 style="color: #10b981; text-align: center;">🎉 Project Approved!</h2>
          <p>Hello ${data.organizerName},</p>
          <p>Great news! Your project <strong>"${data.projectTitle}"</strong> has been <strong style="color: #10b981;">approved</strong> by our admin team.</p>
          <p>Your project is now <strong>active</strong> and visible to all users on the platform. You can start managing volunteers and receiving support for your initiative.</p>
          <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Project:</strong> ${data.projectTitle}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> ACTIVE</p>
          </div>
          <a href="${data.projectUrl}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0;">View Your Project</a>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">Thank you for contributing to our community!</p>
        </div>
      `;
    }

    if (type === 'PROJECT_REJECTED') {
      return `
        <div style="font-family: Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6; color: #333;">
          <h2 style="color: #ef4444; text-align: center;">Project Submission Status</h2>
          <p>Hello ${data.organizerName},</p>
          <p>Thank you for submitting your project <strong>"${data.projectTitle}"</strong>. After review, our admin team has decided to <strong style="color: #ef4444;">reject</strong> this submission.</p>
          <p>This may be due to various reasons such as incomplete information, unclear objectives, or policy violations.</p>
          <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Project:</strong> ${data.projectTitle}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> REJECTED</p>
            ${data.reason ? `<p style="margin: 5px 0;"><strong>Reason:</strong> ${data.reason}</p>` : ''}
          </div>
          <p>You can modify your project and resubmit it for review. If you have questions, please contact our support team.</p>
          <a href="${data.projectUrl}" style="display: inline-block; background: #6b7280; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0;">Review Project</a>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">We appreciate your understanding!</p>
        </div>
      `;
    }

    if (type === 'PROJECT_STATUS_UPDATE') {
      return `
        <div style="font-family: Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6; color: #333;">
          <h2 style="color: #3b82f6;">Project Status Updated</h2>
          <p>Hello ${data.organizerName},</p>
          <p>The status of your project <strong>"${data.projectTitle}"</strong> has been updated.</p>
          <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Project:</strong> ${data.projectTitle}</p>
            <p style="margin: 5px 0;"><strong>New Status:</strong> ${data.status}</p>
          </div>
          <a href="${data.projectUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0;">View Project</a>
        </div>
      `;
    }

    if (type === 'FORGOT_PASSWORD_OTP') {
      return `
        <div style="font-family: Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6; color: #333;">
          <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 32px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 800;">🔐 Password Reset OTP</h1>
          </div>
          <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 32px; border-radius: 0 0 12px 12px;">
            <p>Hello <strong>${data.fullName || 'there'}</strong>,</p>
            <p>We received a request to reset your CCNet password. Use the code below to proceed:</p>
            <div style="background: #fffbeb; border: 2px dashed #f59e0b; padding: 24px; text-align: center; border-radius: 12px; margin: 24px 0;">
              <p style="margin: 0 0 8px; font-size: 13px; color: #92400e; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">Your Reset Code</p>
              <div style="font-size: 48px; font-weight: 900; letter-spacing: 12px; color: #1c1917; font-family: monospace;">${data.otp}</div>
            </div>
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">
              <p style="margin: 0; font-size: 13px; color: #78350f;">
                ⏰ This code expires in <strong>15 minutes</strong>. If you didn't request this, ignore this email — your account is safe.
              </p>
            </div>
            <p style="color: #6b7280; font-size: 12px;">For security, never share this code with anyone, including CCNet staff.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">© CCNet — Connecting Communities, Creating Impact</p>
          </div>
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