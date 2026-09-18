// Clock.vue is copied from the desktop app, where it types its interval handle as NodeJS.Timeout.
// Declaring just that alias keeps the copy byte-identical without pulling node's globals into a
// browser app, where they clash with the DOM's setInterval overloads.
declare namespace NodeJS {
  type Timeout = ReturnType<typeof setInterval>
  type Timer = ReturnType<typeof setInterval>
}
