# Stripe Subscription Setup Guide

This guide will help you set up Stripe subscriptions for the Draftai application.

## Prerequisites

1. A Stripe account (sign up at https://stripe.com)
2. Access to your Stripe Dashboard

## Step 1: Create Subscription Products in Stripe

1. Go to your Stripe Dashboard → Products
2. Create three products with the following pricing:

### Starter Plan
- **Name**: Starter
- **Price**: $9.99/month
- **Billing Period**: Monthly
- **Description**: 500 credits per month

### Pro Plan
- **Name**: Pro
- **Price**: $29.99/month
- **Billing Period**: Monthly
- **Description**: 2,000 credits per month

### Enterprise Plan
- **Name**: Enterprise
- **Price**: $99.99/month
- **Billing Period**: Monthly
- **Description**: 10,000 credits per month

3. After creating each product, copy the **Price ID** (starts with `price_...`)

## Step 2: Update Subscription Plans in Code

Edit `src/services/subscriptions.js` and update the `priceId` field for each plan:

```javascript
export const SUBSCRIPTION_PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 9.99,
    priceId: 'price_YOUR_STARTER_PRICE_ID', // Replace with actual Price ID
    monthlyCredits: 500,
    // ...
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 29.99,
    priceId: 'price_YOUR_PRO_PRICE_ID', // Replace with actual Price ID
    monthlyCredits: 2000,
    // ...
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 99.99,
    priceId: 'price_YOUR_ENTERPRISE_PRICE_ID', // Replace with actual Price ID
    monthlyCredits: 10000,
    // ...
  }
};
```

## Step 3: Set Up Environment Variables

Add the following to your `.env` file or Railway environment variables:

```env
STRIPE_SECRET_KEY=sk_test_... # Your Stripe Secret Key (use sk_live_... for production)
STRIPE_WEBHOOK_SECRET=whsec_... # Your Stripe Webhook Secret
BASE_URL=https://your-domain.com # Your application URL
```

### Getting Your Stripe Keys

1. **Secret Key**: 
   - Go to Stripe Dashboard → Developers → API keys
   - Copy the "Secret key" (use test key for development, live key for production)

2. **Webhook Secret**:
   - Go to Stripe Dashboard → Developers → Webhooks
   - Click "Add endpoint"
   - Set endpoint URL to: `https://your-domain.com/api/stripe/webhook`
   - Select events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
   - Copy the "Signing secret" (starts with `whsec_...`)

## Step 4: Install Stripe SDK

In the server directory, install Stripe:

```bash
cd server
npm install stripe
```

## Step 5: Test the Integration

1. Start your server: `node server.js`
2. In your app, click the credits button (crown icon) in the header
3. Select a paid plan and click "Subscribe"
4. You'll be redirected to Stripe Checkout
5. Use Stripe test cards:
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
   - Use any future expiry date and any 3-digit CVC

## Step 6: Verify Webhook Events

After a successful test subscription:

1. Check Stripe Dashboard → Events to see webhook events
2. Verify that credits were added to the user in Firestore
3. Check that the user's subscription status is updated

## Credit System

### Credit Costs (Based on Fal.ai Pricing)

- **Text Generation**: 1 credit per generation
- **Image Generation**: 3-5 credits (depending on model quality)
- **Video Generation**: 15-20 credits (depending on model)
- **Audio Generation**: 2 credits per generation

### Monthly Credit Reset

Credits automatically reset every 30 days based on the user's subscription plan:
- **Free**: 50 credits/month
- **Starter**: 500 credits/month
- **Pro**: 2,000 credits/month
- **Enterprise**: 10,000 credits/month

The reset happens automatically when:
1. A user attempts to generate content (checks reset date)
2. Stripe webhook processes monthly invoice payment
3. Admin manually triggers reset (via admin dashboard)

## Troubleshooting

### Webhook Not Receiving Events

1. Check that your webhook endpoint URL is correct in Stripe Dashboard
2. Verify `STRIPE_WEBHOOK_SECRET` is set correctly
3. Check server logs for webhook errors
4. Use Stripe CLI for local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`

### Credits Not Resetting

1. Check Firestore `users/{userId}/credits/nextReset` field
2. Verify the reset date has passed
3. Check server logs for reset errors
4. Manually trigger reset via admin dashboard if needed

### Subscription Not Activating

1. Check Stripe Dashboard → Customers to see if customer was created
2. Verify webhook events are being received
3. Check Firestore for `stripeCustomerId` and `stripeSubscriptionId` fields
4. Review server logs for webhook processing errors

## Production Checklist

- [ ] Use live Stripe keys (not test keys)
- [ ] Set up production webhook endpoint
- [ ] Test subscription flow end-to-end
- [ ] Verify credit deduction works correctly
- [ ] Test monthly credit reset
- [ ] Set up monitoring for webhook failures
- [ ] Configure Stripe Customer Portal for subscription management


