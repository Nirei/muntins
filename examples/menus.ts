/**
 * Example faturing menus
 *
 * It showcases the following components:
 * Dialog
 * Drawer
 * Menubar
 * Spinner
 * Toast
 */

import { App, Box, Menubar } from "../src/index.ts";

function Menus() {
  return Box({
    flexDirection: "column",
    onKeyPress: (key) => {
      if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        app.unmount();
        return true;
      }
      return false;
    },
    children: [
      Menubar({
        menus: [
          {
            label: "File",
            items: [{ label: "New" }, { label: "Exit" }],
          },
          {
            label: "Edit",
            items: [{ label: "Undo" }, { label: "Redo" }],
          },
          {
            label: "Help",
            items: [{ label: "About" }],
          },
        ],
      }),
    ],
  });
}

const app = App.mount(Menus, { mouse: true });
