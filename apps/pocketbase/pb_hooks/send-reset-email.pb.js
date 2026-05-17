/// <reference path="../pb_data/types.d.ts" />
onRecordAfterCreateSuccess((e) => {
  const email = e.record.get("email");
  const tokenHash = e.record.get("tokenHash");
  const expiresAt = e.record.get("expiresAt");
  
  // Note: The tokenHash stored in DB is hashed for security.
  // In a real implementation, you would have access to the unhashed token
  // before it was hashed. For now, we'll use the record ID as a reference.
  // The frontend should pass the unhashed token separately or retrieve it
  // from the response before the record is persisted.
  
  const resetLink = "https://yourapp.com/reset-password?token=" + e.record.id;
  
  const message = new MailerMessage({
    from: {
      address: $app.settings().meta.senderAddress,
      name: $app.settings().meta.senderName
    },
    to: [{ address: email }],
    subject: "Reset Your Password",
    html: "<h1>Password Reset Request</h1><p>Click the link below to reset your password:</p><p><a href=\"" + resetLink + "\">Reset Password</a></p><p>This link expires at: " + expiresAt + "</p><p>If you didn't request this, please ignore this email.</p>"
  });
  
  $app.newMailClient().send(message);
  e.next();
}, "resetTokens");