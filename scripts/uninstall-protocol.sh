#!/bin/bash
# Uninstall geppetto:// protocol handler for Linux

set -e

INSTALL_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$INSTALL_DIR/geppetto.desktop"

echo "Uninstalling geppetto:// protocol handler..."

# Remove desktop file
if [ -f "$DESKTOP_FILE" ]; then
    rm "$DESKTOP_FILE"
    echo "✓ Removed desktop file from $INSTALL_DIR"
else
    echo "⚠ Desktop file not found at $DESKTOP_FILE"
fi

# Update desktop database
update-desktop-database "$INSTALL_DIR"
echo "✓ Updated desktop database"

# Note: xdg-mime doesn't have a clean way to unregister, but removing the .desktop file is sufficient
echo ""
echo "Protocol handler uninstalled successfully!"
