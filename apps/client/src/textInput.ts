/**
 * A one-line text field over the canvas, for the few places the player types (the player name).
 * The phone's own keyboard needs a real input element; it is styled with the theme colours and removed afterwards.
 */
import { C, FONT } from "./theme";

const css = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/** Asks for a line of text; resolves with it on Enter or when the field loses focus, null on Escape. */
export function askText(initial: string, maxLength: number, label: string): Promise<string | null> {
  return new Promise((resolve) => {
    const shade = document.createElement("div");
    shade.style.cssText = `position:fixed;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;background:${css(C.bgDeep)}cc`;
    const input = document.createElement("input");
    input.type = "text";
    input.value = initial;
    input.maxLength = maxLength;
    input.setAttribute("aria-label", label);
    input.placeholder = label;
    input.autocomplete = "off";
    input.style.cssText = `width:min(80vw,320px);padding:14px 18px;border-radius:14px;border:2px solid ${css(C.cyan)};background:${css(C.panel)};color:${css(C.text)};font:600 20px ${FONT.text};outline:none;text-align:center`;
    shade.append(input);
    document.body.append(shade);
    let done = false;
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      shade.remove();
      resolve(v);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(input.value);
      else if (e.key === "Escape") finish(null);
    });
    input.addEventListener("blur", () => finish(input.value));
    shade.addEventListener("pointerdown", (e) => {
      if (e.target === shade) finish(input.value);
    });
    input.focus();
    input.select();
  });
}
