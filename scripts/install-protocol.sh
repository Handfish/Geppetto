#!/bin/bash
# Install geppetto:// protocol handler for Linux

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DESKTOP_FILE="$PROJECT_DIR/geppetto.desktop"
INSTALL_DIR="$HOME/.local/share/applications"

echo "Installing geppetto:// protocol handler..."

# Copy desktop file to applications directory
cp "$DESKTOP_FILE" "$INSTALL_DIR/"
echo "✓ Copied desktop file to $INSTALL_DIR"

# Update desktop database
update-desktop-database "$INSTALL_DIR"
echo "✓ Updated desktop database"

# Register as default handler for geppetto:// URLs
xdg-mime default geppetto.desktop x-scheme-handler/geppetto
echo "✓ Registered geppetto:// protocol handler"

echo ""
echo "Protocol handler installed successfully!"
echo "You can now open geppetto:// URLs in your browser."
