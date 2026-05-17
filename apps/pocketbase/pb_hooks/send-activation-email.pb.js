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
  
  const activationLink = "https://yourapp.com/activate?token=" + e.record.id;
  
  const message = new MailerMessage({
    from: {
      address: $app.settings().meta.senderAddress,
      name: $app.settings().meta.senderName
    },
    to: [{ address: email }],
    subject: "Activate Your Account",
    html: "<h1>Welcome!</h1><p>Please activate your account by clicking the link below:</p><p><a href=\"" + activationLink + "\">Activate Account</a></p><p>This link expires at: " + expiresAt + "</p>"
  });
  
  $app.newMailClient().send(message);
  e.next();
}, "activationTokens");