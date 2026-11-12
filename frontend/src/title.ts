/** Document title = [progress prefix] + page title. The prefix shows live
 *  progress while a task runs ("[45%] merge pdfs · phosphor"). */
let base = "phosphor";
let prefix = "";

function render() {
  document.title = prefix + base;
}

export function setBaseTitle(t: string) {
  base = t;
  render();
}

export function setTitlePrefix(p: string) {
  if (p === prefix) return;
  prefix = p;
  render();
}
