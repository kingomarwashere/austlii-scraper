#!/bin/sh
# Restart the I AM THE LAW server via launchd (keeps it permanently alive).

LABEL="com.iamthelaw.server"

# Kick via launchd — it will restart automatically after this
launchctl kickstart -k "gui/$(id -u)/$LABEL" 2>/dev/null \
  || launchctl stop "$LABEL" 2>/dev/null && sleep 1 && launchctl start "$LABEL" 2>/dev/null

echo "[restart] $LABEL kicked"
