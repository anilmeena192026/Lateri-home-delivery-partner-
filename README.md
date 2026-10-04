# Lateri Home Delivery Partner v1 — launch-ready core

This is a mobile-first PWA + Node.js API for a local-delivery business. It is designed so you can start work immediately, while keeping external services configurable.

## Included
- Customer OTP login (demo OTP by default)
- Customer profile + delivery address
- Shops + products + stock
- Cart + COD checkout
- Order creation + persistent JSON database
- Order history + tracking timeline
- Admin panel
- Shop staff panel
- Delivery panel
- Delivery status + optional delivery coordinates API
- Basic OTP rate limiting
- Security headers and role checks
- PWA manifest
- Health endpoint

## Start locally
Requires Node.js 20+.

```bash
npm start
```
Open `http://localhost:3000`.

## Development staff passwords
- Admin: `admin123`
- Shop: `shop123`
- Delivery: `delivery123`

Set real values in environment variables before production:
`ADMIN_PASSWORD`, `SHOP_ADMIN_PASSWORD`, `DELIVERY_ADMIN_PASSWORD`.

## Real OTP / UPI / Maps
The app is deliberately not pretending to have real SMS/payment credentials. To launch publicly, connect:
1. SMS OTP provider (MSG91/Twilio/your preferred Indian provider) in `/api/auth/request-otp`.
2. Razorpay/other gateway in a server-side payment endpoint. Never put secret keys in the browser.
3. Google Maps/Mapbox for address autocomplete and live map.
4. HTTPS + a production database (PostgreSQL/MySQL/Supabase) instead of the demo JSON database.
5. Push notifications (FCM) for order events.

## Production checklist
- Change all staff passwords.
- Set `NODE_ENV=production`.
- Disable `DEMO_OTP` and implement your SMS provider.
- Use HTTPS and a reverse proxy.
- Move sessions and data to a managed database/Redis.
- Add proper admin user management, audit logs and backups.
- Add payment webhook verification before marking UPI orders paid.
- Add Play Store packaging with Capacitor after the web app is deployed.

## Main APIs
- `POST /api/auth/request-otp`
- `POST /api/auth/verify-otp`
- `POST /api/auth/staff-login`
- `GET/PUT /api/me`
- `GET /api/catalog`
- `GET/POST /api/orders`
- `GET /api/orders/:id`
- `GET /api/admin/orders`
- `PATCH /api/admin/orders/:id`
- `GET /api/shop/orders`
- `GET /api/delivery/orders`
- `PATCH /api/delivery/orders/:id`
- `GET /api/admin/stats`
- `GET /api/health`
