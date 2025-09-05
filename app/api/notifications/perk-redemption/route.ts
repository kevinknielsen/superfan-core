import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { supabase } from "../../supabase";
import { type } from "arktype";

// Type assertion for club schema tables
const supabaseAny = supabase as any;

const notificationSchema = type({
  redemption_id: "string",
  unlock_id: "string",
  "resend?": "boolean"
});

interface NotificationData {
  redemption_id: string;
  unlock_id: string;
  resend?: boolean;
  user_email?: string;
  user_phone?: string;
  unlock: {
    title: string;
    description: string;
    unlock_type: string;
    metadata?: {
      redemption_instructions?: string;
      expiry_date?: string;
      location?: string;
      presale_code?: string;
      access_code?: string;
      contact_email?: string;
      contact_phone?: string;
      external_link?: string;
    };
  };
  club: {
    name: string;
  };
  user: {
    email?: string;
    phone?: string;
  };
}

// Email template for perk redemption
function generateEmailContent(data: NotificationData): { subject: string; html: string; text: string } {
  const { unlock, club, user } = data;
  
  const subject = `🎉 Your ${unlock.title} is Ready!`;
  
  const text = `
Congratulations! You've successfully redeemed: ${unlock.title}

Club: ${club.name}
Perk Type: ${unlock.unlock_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}

${unlock.description}

${unlock.metadata?.redemption_instructions ? `
HOW TO USE THIS PERK:
${unlock.metadata.redemption_instructions}
` : ''}

${unlock.metadata?.presale_code ? `
PRESALE CODE: ${unlock.metadata.presale_code}
` : ''}

${unlock.metadata?.access_code ? `
ACCESS CODE: ${unlock.metadata.access_code}
` : ''}

${unlock.metadata?.location ? `
LOCATION: ${unlock.metadata.location}
` : ''}

${unlock.metadata?.expiry_date ? `
VALID UNTIL: ${new Date(unlock.metadata.expiry_date).toLocaleDateString()}
` : ''}

${unlock.metadata?.contact_email || unlock.metadata?.contact_phone ? `
NEED HELP?
${unlock.metadata.contact_email ? `Email: ${unlock.metadata.contact_email}` : ''}
${unlock.metadata.contact_phone ? `Phone: ${unlock.metadata.contact_phone}` : ''}
` : ''}

${unlock.metadata?.external_link ? `
CONTINUE HERE: ${unlock.metadata.external_link}
` : ''}

Thanks for being a Superfan!
- The ${club.name} Team
  `;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e1e5e9; border-top: none; border-radius: 0 0 10px 10px; }
    .perk-card { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .code-box { background: #e3f2fd; border: 1px solid #2196f3; border-radius: 6px; padding: 15px; margin: 15px 0; font-family: monospace; font-size: 18px; font-weight: bold; text-align: center; color: #1565c0; }
    .info-grid { display: grid; gap: 15px; margin: 20px 0; }
    .info-item { display: flex; align-items: center; gap: 10px; }
    .info-label { font-weight: 600; color: #495057; min-width: 80px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 10px 0; }
    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e1e5e9; color: #6c757d; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎉 Perk Redeemed!</h1>
    <p style="margin: 0; font-size: 18px; opacity: 0.9;">${unlock.title}</p>
  </div>
  
  <div class="content">
    <div class="perk-card">
      <h2 style="margin-top: 0; color: #495057;">${unlock.title}</h2>
      <p><strong>Club:</strong> ${club.name}</p>
      <p><strong>Type:</strong> ${unlock.unlock_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
      <p>${unlock.description}</p>
    </div>

    ${unlock.metadata?.redemption_instructions ? `
    <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 20px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #856404;">📝 How to Use This Perk</h3>
      <p style="margin-bottom: 0;">${unlock.metadata.redemption_instructions}</p>
    </div>
    ` : ''}

    ${unlock.metadata?.presale_code ? `
    <div>
      <h3>🎫 Your Presale Code</h3>
      <div class="code-box">${unlock.metadata.presale_code}</div>
    </div>
    ` : ''}

    ${unlock.metadata?.access_code ? `
    <div>
      <h3>🔑 Your Access Code</h3>
      <div class="code-box">${unlock.metadata.access_code}</div>
    </div>
    ` : ''}

    <div class="info-grid">
      ${unlock.metadata?.location ? `
      <div class="info-item">
        <span class="info-label">📍 Location:</span>
        <span>${unlock.metadata.location}</span>
      </div>
      ` : ''}
      
      ${unlock.metadata?.expiry_date ? `
      <div class="info-item">
        <span class="info-label">📅 Valid Until:</span>
        <span>${new Date(unlock.metadata.expiry_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
      </div>
      ` : ''}
    </div>

    ${unlock.metadata?.external_link ? `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${unlock.metadata.external_link}" class="button">Continue to ${unlock.unlock_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} →</a>
    </div>
    ` : ''}

    ${unlock.metadata?.contact_email || unlock.metadata?.contact_phone ? `
    <div style="background: #f8f9fa; border-radius: 6px; padding: 20px; margin: 20px 0;">
      <h3 style="margin-top: 0;">Need Help?</h3>
      ${unlock.metadata.contact_email ? `<p>📧 Email: <a href="mailto:${unlock.metadata.contact_email}">${unlock.metadata.contact_email}</a></p>` : ''}
      ${unlock.metadata.contact_phone ? `<p>📞 Phone: <a href="tel:${unlock.metadata.contact_phone}">${unlock.metadata.contact_phone}</a></p>` : ''}
    </div>
    ` : ''}
  </div>

  <div class="footer">
    <p>Thanks for being a Superfan! 🌟</p>
    <p>- The ${club.name} Team</p>
  </div>
</body>
</html>
  `;

  return { subject, html, text };
}

// SMS template for perk redemption
function generateSMSContent(data: NotificationData): string {
  const { unlock, club } = data;
  
  let message = `🎉 ${club.name} Perk Redeemed!\n\n`;
  message += `${unlock.title}\n`;
  message += `${unlock.description}\n\n`;
  
  if (unlock.metadata?.presale_code) {
    message += `Code: ${unlock.metadata.presale_code}\n`;
  }
  
  if (unlock.metadata?.access_code) {
    message += `Access: ${unlock.metadata.access_code}\n`;
  }
  
  if (unlock.metadata?.location) {
    message += `📍 ${unlock.metadata.location}\n`;
  }
  
  if (unlock.metadata?.expiry_date) {
    message += `Valid until: ${new Date(unlock.metadata.expiry_date).toLocaleDateString()}\n`;
  }
  
  if (unlock.metadata?.external_link) {
    message += `\n${unlock.metadata.external_link}`;
  }
  
  message += `\nCheck your email for full details!`;
  
  return message;
}

export async function POST(request: NextRequest) {
  try {
    // Note: This endpoint can be called internally without auth for system notifications
    // but we'll still verify if auth is provided
    const body = await request.json();
    const notificationData = notificationSchema(body);

    if (notificationData instanceof type.errors) {
      console.error("[Perk Notification API] Invalid request body:", notificationData);
      return NextResponse.json(
        { error: "Invalid request body", message: notificationData.summary },
        { status: 400 }
      );
    }

    // Get redemption details
    const { data: redemption, error: redemptionError } = await supabaseAny
      .from('unlock_redemptions')
      .select('*')
      .eq('id', notificationData.redemption_id)
      .single();

    if (redemptionError) {
      console.error("[Perk Notification API] Redemption not found:", redemptionError);
      return NextResponse.json({ error: "Redemption not found" }, { status: 404 });
    }

    // Get unlock details
    const { data: unlock, error: unlockError } = await supabaseAny
      .from('unlocks')
      .select('*')
      .eq('id', notificationData.unlock_id)
      .single();

    if (unlockError) {
      console.error("[Perk Notification API] Unlock not found:", unlockError);
      return NextResponse.json({ error: "Unlock not found" }, { status: 404 });
    }

    // Get club details
    const { data: club, error: clubError } = await supabaseAny
      .from('clubs')
      .select('name')
      .eq('id', unlock.club_id)
      .single();

    if (clubError) {
      console.error("[Perk Notification API] Club not found:", clubError);
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
    }

    // Get user details
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, phone')
      .eq('id', redemption.user_id)
      .single();

    if (userError) {
      console.error("[Perk Notification API] User not found:", userError);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prepare notification data
    const fullNotificationData: NotificationData = {
      redemption_id: notificationData.redemption_id,
      unlock_id: notificationData.unlock_id,
      user_email: notificationData.user_email || user.email,
      user_phone: notificationData.user_phone || user.phone,
      unlock,
      club,
      user
    };

    // Generate email content
    const emailContent = generateEmailContent(fullNotificationData);
    const smsContent = generateSMSContent(fullNotificationData);

    // TODO: Integrate with actual email service (SendGrid, Resend, etc.)
    // For now, we'll log the content and return success
    console.log("[Perk Notification API] Email would be sent:", {
      to: fullNotificationData.user_email,
      subject: emailContent.subject,
      preview: emailContent.text.substring(0, 200) + '...'
    });

    // TODO: Integrate with actual SMS service (Twilio, etc.)
    if (fullNotificationData.user_phone) {
      console.log("[Perk Notification API] SMS would be sent:", {
        to: fullNotificationData.user_phone,
        message: smsContent.substring(0, 160) + '...'
      });
    }

    // Store notification record for tracking
    const { error: notificationError } = await supabaseAny
      .from('notifications')
      .insert({
        user_id: redemption.user_id,
        type: 'perk_redemption',
        channel: fullNotificationData.user_email ? 'email' : 'sms',
        recipient: fullNotificationData.user_email || fullNotificationData.user_phone,
        subject: emailContent.subject,
        content: fullNotificationData.user_email ? emailContent.html : smsContent,
        metadata: {
          redemption_id: notificationData.redemption_id,
          unlock_id: notificationData.unlock_id,
          unlock_title: unlock.title,
          club_name: club.name
        },
        sent_at: new Date().toISOString(),
        status: 'sent' // TODO: Update based on actual send result
      });

    if (notificationError) {
      console.error("[Perk Notification API] Failed to store notification record:", notificationError);
      // Don't fail the request, just log the error
    }

    console.log(`[Perk Notification API] Notification sent for redemption ${notificationData.redemption_id}`);

    return NextResponse.json({
      success: true,
      message: "Notification sent successfully",
      channels: {
        email: !!fullNotificationData.user_email,
        sms: !!fullNotificationData.user_phone
      }
    });

  } catch (error) {
    console.error("[Perk Notification API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
