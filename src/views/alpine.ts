/**
 * Alpine directive names that carry modifiers - `x-on:click.self`,
 * `x-on:keydown.escape.window` - contain dots, which JSX cannot parse as an
 * attribute name. Spreading them as an object is the standard way around it:
 *
 *   <div {...ax({ "x-on:click.self": "close()" })}>
 *
 * Plain directives without modifiers (`x-data`, `x-show`, `x-on:click`) parse
 * fine and should be written as normal attributes.
 */
export function ax<T extends Record<string, string | boolean | number>>(attrs: T): T {
  return attrs;
}
