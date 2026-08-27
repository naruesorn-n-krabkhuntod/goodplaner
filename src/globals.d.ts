/**
 * @kitajs/html ships ambient JSX augmentations for htmx and Alpine attributes.
 * They are referenced by path because they are plain global .d.ts files that
 * the `types` compiler option cannot resolve through the package exports map.
 */

/// <reference path="../node_modules/@kitajs/html/htmx.d.ts" />
/// <reference path="../node_modules/@kitajs/html/alpine.d.ts" />

export {};
