rm -rf dist

# Minify JS files from js/ and output to dist/js/
for file in background.js content.js popup.js; do
  npx terser "$file" -o "dist/$file" \
  --compress \
  --mangle reserved=['el','dataBind']
done

# Copy everything except the js folder into dist/
rsync -av --exclude 'js' --exclude 'script.js' --exclude 'dist' ./ dist/

# Zip the dist folder
zip -r dist.zip dist/