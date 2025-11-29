/**
 * Email Delivery Service
 *
 * Handles SMTP email delivery for scheduled reports and notifications.
 * Supports attachments (PDF, CSV, Excel) and HTML templates.
 *
 * @author AITX Chronos Team
 */

import nodemailer, { Transporter } from 'nodemailer';

// =============================================================================
// INTERFACES
// =============================================================================

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: {
    name: string;
    address: string;
  };
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  encoding?: 'base64' | 'binary';
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  accepted?: string[];
  rejected?: string[];
}

export interface ReportEmailData {
  reportName: string;
  reportType: 'scheduled' | 'on_demand';
  generatedAt: Date;
  recordCount: number;
  filters?: Record<string, string>;
  exportFormat: 'pdf' | 'csv' | 'xlsx';
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: EmailConfig = {
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  from: {
    name: process.env.SMTP_FROM_NAME || 'AITX Chronos',
    address: process.env.SMTP_FROM_ADDRESS || 'noreply@aitx-chronos.com',
  },
};

// =============================================================================
// EMAIL SERVICE CLASS
// =============================================================================

export class EmailService {
  private transporter: Transporter | null = null;
  private config: EmailConfig;
  private initialized: boolean = false;

  constructor(config: Partial<EmailConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the email transporter
   */
  async initialize(): Promise<boolean> {
    // Skip if already initialized or no SMTP host configured
    if (this.initialized) return true;

    if (!this.config.host || !this.config.auth.user) {
      console.warn('[EmailService] SMTP not configured - email delivery disabled');
      return false;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.auth.user,
          pass: this.config.auth.pass,
        },
        tls: {
          rejectUnauthorized: process.env.NODE_ENV === 'production',
        },
      });

      // Verify connection
      await this.transporter.verify();
      this.initialized = true;
      console.log('[EmailService] SMTP connection verified successfully');
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to initialize SMTP:', error);
      this.transporter = null;
      return false;
    }
  }

  /**
   * Check if email service is configured and ready
   */
  isReady(): boolean {
    return this.initialized && this.transporter !== null;
  }

  /**
   * Send an email
   */
  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    if (!this.isReady()) {
      // Try to initialize
      const ready = await this.initialize();
      if (!ready) {
        return {
          success: false,
          error: 'Email service not configured or initialization failed',
        };
      }
    }

    try {
      const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to;
      const ccRecipients = options.cc
        ? Array.isArray(options.cc) ? options.cc.join(', ') : options.cc
        : undefined;
      const bccRecipients = options.bcc
        ? Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc
        : undefined;

      const mailOptions = {
        from: `"${this.config.from.name}" <${this.config.from.address}>`,
        to: recipients,
        cc: ccRecipients,
        bcc: bccRecipients,
        subject: options.subject,
        html: options.html,
        text: options.text || this.stripHtml(options.html),
        replyTo: options.replyTo,
        attachments: options.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
          encoding: att.encoding,
        })),
      };

      const result = await this.transporter!.sendMail(mailOptions);

      console.log(`[EmailService] Email sent: ${result.messageId}`);

      return {
        success: true,
        messageId: result.messageId,
        accepted: result.accepted as string[],
        rejected: result.rejected as string[],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[EmailService] Failed to send email:', errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Send a scheduled report email
   */
  async sendReportEmail(
    recipients: string[],
    reportData: ReportEmailData,
    attachment: EmailAttachment
  ): Promise<EmailResult> {
    const html = this.generateReportEmailHtml(reportData);

    return this.sendEmail({
      to: recipients,
      subject: `[Chronos] ${reportData.reportName} - ${reportData.generatedAt.toLocaleDateString()}`,
      html,
      attachments: [attachment],
    });
  }

  /**
   * Send a notification email
   */
  async sendNotificationEmail(
    to: string | string[],
    subject: string,
    title: string,
    message: string,
    actionUrl?: string,
    actionText?: string
  ): Promise<EmailResult> {
    const html = this.generateNotificationEmailHtml(title, message, actionUrl, actionText);

    return this.sendEmail({
      to,
      subject: `[Chronos] ${subject}`,
      html,
    });
  }

  // ===========================================================================
  // HTML EMAIL TEMPLATES
  // ===========================================================================

  /**
   * Generate report email HTML
   */
  private generateReportEmailHtml(data: ReportEmailData): string {
    const formattedDate = data.generatedAt.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const filterRows = data.filters
      ? Object.entries(data.filters)
          .map(([key, value]) => `<tr><td style="padding: 5px 10px; color: #666;">${key}:</td><td style="padding: 5px 10px;">${value}</td></tr>`)
          .join('')
      : '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px 40px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">AITX CHRONOS</h1>
        <p style="color: #a0c4e8; margin: 5px 0 0 0; font-size: 12px;">Railcar Fleet Management System</p>
      </td>
    </tr>

    <!-- Content -->
    <tr>
      <td style="padding: 40px;">
        <h2 style="color: #1e3a5f; margin: 0 0 20px 0; font-size: 20px;">Scheduled Report Ready</h2>

        <p style="margin: 0 0 20px 0;">Your scheduled report <strong>${data.reportName}</strong> has been generated and is attached to this email.</p>

        <table style="width: 100%; background-color: #f8f9fa; border-radius: 8px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 20px;">
              <table style="width: 100%;">
                <tr>
                  <td style="padding: 5px 10px; color: #666; width: 40%;">Report Name:</td>
                  <td style="padding: 5px 10px; font-weight: bold;">${data.reportName}</td>
                </tr>
                <tr>
                  <td style="padding: 5px 10px; color: #666;">Generated:</td>
                  <td style="padding: 5px 10px;">${formattedDate}</td>
                </tr>
                <tr>
                  <td style="padding: 5px 10px; color: #666;">Records:</td>
                  <td style="padding: 5px 10px;">${data.recordCount.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 5px 10px; color: #666;">Format:</td>
                  <td style="padding: 5px 10px; text-transform: uppercase;">${data.exportFormat}</td>
                </tr>
                ${filterRows}
              </table>
            </td>
          </tr>
        </table>

        <p style="margin: 0 0 20px 0; color: #666; font-size: 14px;">
          This is an automated ${data.reportType === 'scheduled' ? 'scheduled' : 'on-demand'} report.
          Please see the attached file for the complete report data.
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/reports"
             style="display: inline-block; background-color: #1e3a5f; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            View in Chronos
          </a>
        </div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background-color: #f8f9fa; padding: 20px 40px; text-align: center; border-top: 1px solid #e0e0e0;">
        <p style="margin: 0; color: #888; font-size: 12px;">
          This email was sent by AITX Chronos Scheduler
        </p>
        <p style="margin: 5px 0 0 0; color: #888; font-size: 12px;">
          Confidential - For authorized recipients only
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  /**
   * Generate notification email HTML
   */
  private generateNotificationEmailHtml(
    title: string,
    message: string,
    actionUrl?: string,
    actionText?: string
  ): string {
    const actionButton = actionUrl
      ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${actionUrl}"
             style="display: inline-block; background-color: #1e3a5f; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            ${actionText || 'View Details'}
          </a>
        </div>
      `
      : '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px 40px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">AITX CHRONOS</h1>
        <p style="color: #a0c4e8; margin: 5px 0 0 0; font-size: 12px;">Railcar Fleet Management System</p>
      </td>
    </tr>

    <!-- Content -->
    <tr>
      <td style="padding: 40px;">
        <h2 style="color: #1e3a5f; margin: 0 0 20px 0; font-size: 20px;">${title}</h2>

        <div style="margin: 0 0 20px 0;">
          ${message.replace(/\n/g, '<br>')}
        </div>

        ${actionButton}
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background-color: #f8f9fa; padding: 20px 40px; text-align: center; border-top: 1px solid #e0e0e0;">
        <p style="margin: 0; color: #888; font-size: 12px;">
          This notification was sent by AITX Chronos Scheduler
        </p>
        <p style="margin: 5px 0 0 0; color: #888; font-size: 12px;">
          Confidential - For authorized recipients only
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  /**
   * Strip HTML tags for plain text version
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const emailService = new EmailService();
export default emailService;
