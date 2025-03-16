#!/bin/bash

# This script helps set up a Stripe webhook for local testing using the Stripe CLI
# Prerequisites: You must have the Stripe CLI installed
# Install guide: https://stripe.com/docs/stripe-cli#install

# Check if Stripe CLI is installed
if ! command -v stripe &> /dev/null
then
    echo "The Stripe CLI is not installed. Please install it first:"
    echo "https://stripe.com/docs/stripe-cli#install"
    exit 1
fi

# Check if the user is logged in to Stripe
stripe whoami &> /dev/null
if [ $? -ne 0 ]; then
    echo "You are not logged in to Stripe. Please login first:"
    stripe login
fi

# Get the port from .env or use the default
ENV_FILE="./backend/.env"
PORT=$(grep "PORT" $ENV_FILE | cut -d '=' -f2)
PORT=${PORT:-3000}

echo "Starting Stripe webhook forwarding to http://localhost:$PORT/api/webhook"
echo "Events will be forwarded to your local server"
echo "Press Ctrl+C to stop the forwarding"

# Start the webhook forwarding
stripe listen --forward-to http://localhost:$PORT/api/webhook --events checkout.session.completed,checkout.session.expired,payment_intent.succeeded,payment_intent.payment_failed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted

# Note: This will output a webhook signing secret that you should add to your .env file
# as STRIPE_WEBHOOK_SECRET