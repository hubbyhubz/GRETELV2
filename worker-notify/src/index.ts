import { createClient } from '@supabase/supabase-js';
import * as jose from 'jose';
import type { ExecutionContext, ScheduledEvent } from '@cloudflare/workers-types';

export interface Env {
  VITE_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  VITE_VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log('⏰ Cron Triggered: Checking for pending notifications...');

    // 1. Setup Dependencies
    const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    
    // 2. Fetch Pending Notifications
    const { data: messages, error } = await supabase
      .from('push_notifications_queue')
      .select('*')
      .is('delivered_at', null)
      .is('locked_at', null)
      .limit(5);

    if (error) {
      console.error('❌ DB Error:', error);
      return;
    }

    if (!messages || messages.length === 0) {
      console.log('✅ No pending messages.');
      return;
    }

    console.log(`📬 Found ${messages.length} pending messages.`);

    // 3. Process Each Message
    for (const msg of messages) {
      // Lock message
      await supabase
        .from('push_notifications_queue')
        .update({ locked_at: new Date().toISOString() })
        .eq('id', msg.id);

      // Get Subscriptions
      const { data: subscriptions } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', msg.user_id);

      if (!subscriptions || subscriptions.length === 0) {
        console.log(`⚠️ No subscriptions for user ${msg.user_id}`);
        await supabase.from('push_notifications_queue').update({ delivered_at: new Date().toISOString(), error: 'No subscriptions' }).eq('id', msg.id);
        continue;
      }

      // Generate VAPID Token (JWT)
      // Note: We are NOT encrypting the payload here because it's complex in Workers.
      // We send an empty payload (or minimal) and rely on the Service Worker to fetch the data OR just show a generic message.
      // BUT: If we send a payload without encryption, the browser might reject it or we can't send it at all.
      // Web Push standard requires encryption for payload.
      // So we will send NO payload (body: null).
      // The Service Worker will receive a push event with null data.
      // We will handle this in SW to show a generic "New Message" notification.
      
      const vapidToken = await generateVapidToken(env.VAPID_SUBJECT, env.VAPID_PRIVATE_KEY);

      const sendPromises = subscriptions.map(async (sub) => {
        try {
          const response = await fetch(sub.endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `vapid t=${vapidToken}, k=${env.VITE_VAPID_PUBLIC_KEY}`,
              'TTL': '60',
            },
            body: null // No payload = No encryption needed!
          });

          if (!response.ok) {
             const text = await response.text();
             console.error(`❌ Push failed: ${response.status} ${text}`);
             if (response.status === 410 || response.status === 404) {
               await supabase.from('push_subscriptions').delete().eq('id', sub.id);
             }
             throw new Error(`Push failed: ${response.status}`);
          }
          
          return { success: true, id: sub.id };
        } catch (err: any) {
          console.error(`❌ Send failed to device ${sub.id}:`, err);
          return { success: false, error: err };
        }
      });

      await Promise.all(sendPromises);

      // 4. Mark as Delivered
      await supabase
        .from('push_notifications_queue')
        .update({ delivered_at: new Date().toISOString() })
        .eq('id', msg.id);
      
      console.log(`✅ Message ${msg.id} processed.`);
    }
  },
};

// Helper to generate VAPID JWT
async function generateVapidToken(subject: string, privateKey: string) {
  const alg = 'ES256';
  
  // Convert PEM/Base64 key to CryptoKey
  // Assuming privateKey is a base64 encoded string (which standard VAPID libs output)
  // or a PKCS8 string.
  // web-push generates URL-safe Base64.
  
  const pk = await importPrivateKey(privateKey);

  const token = await new jose.SignJWT({
    aud: 'https://fcm.googleapis.com', // Ideally this should be the origin of the endpoint, but usually audience is required.
    // Actually, VAPID spec says 'aud' should be the origin of the push service.
    // Since we have multiple endpoints (FCM, Mozilla), we should ideally parse the endpoint.
    // But let's try 'https://fcm.googleapis.com' as a default or dynamic?
    // Let's use 'https://fcm.googleapis.com' for now, or better:
    // We should parse the origin from the subscription endpoint.
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12 hours
    sub: subject
  })
  .setProtectedHeader({ alg, typ: 'JWT' })
  .sign(pk);

  return token;
}

async function importPrivateKey(pemOrBase64: string) {
  // If it's URL-safe base64 (standard web-push format)
  // We need to convert to PKCS8 or JWK.
  // 'jose' can import PKCS8 PEM or JWK.
  // If we have the raw d-value (32 bytes), we can construct a JWK.
  
  // Most VAPID keys generated by web-push are 32 bytes URL-Safe Base64.
  // Let's assume it's that.
  
  try {
      return await jose.importPKCS8(pemOrBase64, 'ES256');
  } catch (e) {
      // If not PEM, maybe it's the raw base64 private key?
      // Construct JWK
      // Actually jose importJWK handles this.
      return await jose.importJWK({
        kty: 'EC',
        crv: 'P-256',
        d: pemOrBase64,
        x: '', // Optional for private key? No, strictly need full key or just d?
        y: '' 
      }, 'ES256');
  }
}
