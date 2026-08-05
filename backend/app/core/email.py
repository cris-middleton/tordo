"""
Email service for sending notifications
Supports SMTP (Gmail, SendGrid, AWS SES, etc.)
"""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger(__name__)


def send_email(
    to: str,
    subject: str,
    body: str,
    html_body: str | None = None,
    from_email: str | None = None,
) -> bool:
    """
    Send an email notification

    Args:
        to: Recipient email address
        subject: Email subject
        body: Plain text email body
        html_body: Optional HTML email body
        from_email: Sender email (defaults to settings.smtp_from_email)

    Returns:
        True if email was sent successfully, False otherwise
    """
    # Check if email is configured
    if not settings.smtp_host or not settings.smtp_user:
        logger.warning("Email not configured. Skipping email send.")
        return False

    try:
        # Create message
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = from_email or settings.smtp_from_email or settings.smtp_user
        msg["To"] = to

        # Add plain text part
        text_part = MIMEText(body, "plain", "utf-8")
        msg.attach(text_part)

        # Add HTML part if provided
        if html_body:
            html_part = MIMEText(html_body, "html", "utf-8")
            msg.attach(html_part)

        # Connect to SMTP server
        if settings.smtp_use_tls:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port)

        # Login and send
        if settings.smtp_user and settings.smtp_password:
            server.login(settings.smtp_user, settings.smtp_password)

        server.send_message(msg)
        server.quit()

        logger.info(f"Email sent successfully to {to}")
        return True

    except Exception as e:
        logger.error(f"Failed to send email to {to}: {e}")
        return False


def send_alert_email(
    user_email: str, alert_title: str, alert_message: str, alert_url: str | None = None
) -> bool:
    """
    Send an alert notification email with formatted template

    Args:
        user_email: Recipient email
        alert_title: Alert title
        alert_message: Alert message
        alert_url: Optional URL to view the alert

    Returns:
        True if email was sent successfully
    """
    subject = f"New Alert: {alert_title}"

    # Plain text body
    body = f"""
Hello,

You have a new alert:

{alert_title}

{alert_message}
"""
    if alert_url:
        body += f"\nView alert: {alert_url}"

    # HTML body
    html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #4CAF50; color: white; padding: 20px; text-align: center; }}
        .content {{ padding: 20px; background-color: #f9f9f9; }}
        .alert-title {{ font-size: 18px; font-weight: bold; margin-bottom: 10px; }}
        .alert-message {{ margin-bottom: 20px; }}
        .button {{ display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>New Alert</h2>
        </div>
        <div class="content">
            <div class="alert-title">{alert_title}</div>
            <div class="alert-message">{alert_message}</div>
"""
    if alert_url:
        html_body += f'            <a href="{alert_url}" class="button">View Alert</a>'

    html_body += """
        </div>
    </div>
</body>
</html>
"""

    return send_email(
        to=user_email,
        subject=subject,
        body=body,
        html_body=html_body,
    )
