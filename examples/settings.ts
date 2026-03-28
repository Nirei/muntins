/**
 * Settings Panel Example
 *
 * A real-world settings/preferences panel demonstrating form controls:
 * - Input: single-line text input (Username)
 * - Textarea: multi-line text input (Bio)
 * - RadioGroup: exclusive selection (Theme)
 * - Switch: on/off toggle (Notifications, Sound)
 * - Select: dropdown selection (Country)
 * - Button: actions (Cancel, Save)
 * - Separator: visual dividers
 * - Label: field labels
 *
 * Also showcases:
 * - TabFocus for keyboard navigation
 * - Reactive state management
 * - Consistent styling with color palette
 * - Flexbox layout
 *
 * Run with: node --experimental-strip-types examples/settings.ts
 */

import {
  App,
  Box,
  Button,
  Input,
  Label,
  RadioGroup,
  Select,
  Separator,
  Switch,
  TabFocus,
  Text,
  Textarea,
  createRef,
  createSignal,
} from "../src/index.ts";

// Form state
const [username, setUsername] = createSignal("johndoe");
const [bio, setBio] = createSignal("Software developer\nLoves building TUIs");
const [theme, setTheme] = createSignal<"light" | "dark" | "system">("dark");
const [notifications, setNotifications] = createSignal(true);
const [sound, setSound] = createSignal(false);
const [country, setCountry] = createSignal("us");

// Status message for save feedback
const [status, setStatus] = createSignal("");

function SectionHeader(title: string) {
  return Box({
    flexDirection: "column",
    gap: 0,
    marginTop: 1,
    children: [
      Text({ content: title, bold: true }),
      Separator({ style: { marginTop: 0 } }),
    ],
  });
}

function FormRow(props: {
  label: string;
  children: ReturnType<typeof Box>;
  alignTop?: boolean;
}) {
  return Box({
    flexDirection: "row",
    gap: 2,
    alignItems: props.alignTop ? "flex-start" : "center",
    children: [
      Box({
        width: 14,
        children: [Text({ content: props.label })],
      }),
      props.children,
    ],
  });
}

function SettingsPanel() {
  return Box({
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "flex-end",
    children: [
      // Main card
      Box({
        flexDirection: "column",
        width: 52,
        border: true,
        borderStyle: "round",
        paddingStart: 2,
        paddingEnd: 2,
        paddingTop: 1,
        paddingBottom: 1,
        children: [
          // Header
          Box({
            children: [Text({ content: "Settings", bold: true })],
          }),

          // Content
          Box({
            flexDirection: "column",
            gap: 1,
            children: [
              // Profile section
              SectionHeader("Profile"),

              FormRow({
                label: "Username",
                children: Input({
                  value: username,
                  onChange: setUsername,
                  width: 28,
                  placeholder: "Enter username",
                  autoFocus: true,
                }),
              }),

              FormRow({
                label: "Bio",
                alignTop: true,
                children: Textarea({
                  value: bio,
                  onChange: setBio,
                  width: 28,
                  maxHeight: 3,
                  placeholder: "Tell us about yourself",
                }),
              }),

              // Preferences section
              SectionHeader("Preferences"),

              FormRow({
                label: "Theme",
                children: RadioGroup({
                  value: theme,
                  onChange: setTheme,
                  options: [
                    { value: "light" as const, label: "Light" },
                    { value: "dark" as const, label: "Dark" },
                    { value: "system" as const, label: "System" },
                  ],
                  style: { gap: 2 },
                }),
              }),

              FormRow({
                label: "Notifications",
                children: (() => {
                  const switchRef = createRef();
                  return Box({
                    flexDirection: "row",
                    gap: 1,
                    alignItems: "center",
                    children: [
                      Switch({
                        ref: switchRef,
                        checked: notifications,
                        onChange: setNotifications,
                      }),
                      Label({
                        children: () =>
                          notifications() ? "Enabled" : "Disabled",
                        for: switchRef,
                      }),
                    ],
                  });
                })(),
              }),

              FormRow({
                label: "Sound",
                children: (() => {
                  const switchRef = createRef();
                  return Box({
                    flexDirection: "row",
                    gap: 1,
                    alignItems: "center",
                    children: [
                      Switch({
                        ref: switchRef,
                        checked: sound,
                        onChange: setSound,
                      }),
                      Label({
                        children: () => (sound() ? "Enabled" : "Disabled"),
                        for: switchRef,
                      }),
                    ],
                  });
                })(),
              }),

              // Region section
              SectionHeader("Region"),

              FormRow({
                label: "Country",
                children: Select({
                  value: country,
                  onChange: setCountry,
                  placeholder: "Select country",
                  options: [
                    { value: "au", label: "Australia" },
                    { value: "ca", label: "Canada" },
                    { value: "fr", label: "France" },
                    { value: "de", label: "Germany" },
                    { value: "jp", label: "Japan" },
                    { value: "uk", label: "United Kingdom" },
                    { value: "us", label: "United States" },
                  ],
                  style: { width: 22 },
                }),
              }),

              // Actions
              Box({
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 2,
                marginTop: 2,
                children: [
                  // Status message
                  Box({
                    flexGrow: 1,
                    children: [
                      Text({
                        content: status,
                        dim: true,
                      }),
                    ],
                  }),

                  Button({
                    children: "Cancel",
                    onClick: () => {
                      app.unmount();
                    },
                  }),

                  Button({
                    children: "Save",
                    onClick: () => {
                      setStatus("Saved!");
                      setTimeout(() => setStatus(""), 2000);
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
      }),

      // Help text
      Box({
        children: [
          Text({
            content:
              "Tab/Mouse to navigate  |  Enter/Space/Click to interact  |  Esc to quit",
            dim: true,
          }),
        ],
      }),
    ],
  });
}

function Settings() {
  return Box({
    flexGrow: 1,
    focusable: true,
    onKeyPress: (key) => {
      if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        app.unmount();
        return true;
      }
      return false;
    },
    children: [
      TabFocus({
        children: [SettingsPanel()],
      }),
    ],
  });
}

const app = App.mount(Settings, { mouse: true });
