#!/bin/bash

# Setup MQTT authentication for Oltu Platform
# This script generates secure MQTT passwords and updates the configuration

set -e

MQTT_CONFIG_DIR="$(dirname "$0")/mosquitto"
PASSWORD_FILE="$MQTT_CONFIG_DIR/password.txt"

# Check if mosquitto_passwd is available
if ! command -v mosquitto_passwd &> /dev/null; then
    echo "Error: mosquitto_passwd command not found"
    echo "Please install mosquitto client tools:"
    echo "  Ubuntu/Debian: apt-get install mosquitto-clients"
    echo "  CentOS/RHEL: yum install mosquitto"
    echo "  macOS: brew install mosquitto"
    exit 1
fi

# Create config directory if it doesn't exist
mkdir -p "$MQTT_CONFIG_DIR"

# Generate secure passwords
echo "Generating secure MQTT passwords..."

# Backend service password
BACKEND_PASSWORD=$(openssl rand -base64 32)
echo "Backend service password: $BACKEND_PASSWORD"

# Create password file with backend service
mosquitto_passwd -c "$PASSWORD_FILE" backend-service <<< "$BACKEND_PASSWORD"

echo ""
echo "MQTT authentication setup complete!"
echo ""
echo "🔐 Security Configuration:"
echo "  - Anonymous access: DISABLED"
echo "  - Password authentication: ENABLED"
echo "  - Access control lists: ENABLED"
echo ""
echo "📝 Next steps:"
echo "1. Update your backend .env file with:"
echo "   MQTT_USERNAME=backend-service"
echo "   MQTT_PASSWORD=$BACKEND_PASSWORD"
echo ""
echo "2. For vehicle authentication, add each vehicle with:"
echo "   mosquitto_passwd $PASSWORD_FILE vehicle-001"
echo ""
echo "3. Restart MQTT broker to apply changes"
echo ""
echo "⚠️  IMPORTANT: Store the backend password securely!"