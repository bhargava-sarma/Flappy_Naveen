#!/bin/bash

# This script runs during Vercel Build to inject secrets into config.js
echo "Building config.js from Environment Variables..."

if [ -z "$SUPABASE_URL" ]; then
  echo "Warning: SUPABASE_URL is not set!"
else
  echo "window.SUPABASE_URL = '$SUPABASE_URL';" > config.js
fi

if [ -z "$SUPABASE_KEY" ]; then
  echo "Warning: SUPABASE_KEY is not set!"
else
  echo "window.SUPABASE_KEY = '$SUPABASE_KEY';" >> config.js
fi

echo "Config generation complete."
