/** The coffee photos from the JavaGem Figma file (public/figma/photos). */
const COFFEE_PHOTOS = ["p2", "p3", "p4", "p5"];

/**
 * A photo for drinks that are actually coffee, or null. The menu has no image column, so dishes
 * without a fitting photo show a lettered tile instead of a misleading picture.
 */
export function menuPhoto(name: string): string | null {
  if (!/coffee|latte|mocha|espresso|cappuccino/i.test(name)) return null;
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `/figma/photos/${COFFEE_PHOTOS[hash % COFFEE_PHOTOS.length]}.jpg`;
}
