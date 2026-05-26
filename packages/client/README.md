# @tenderlane/client

Framework-agnostic headless checkout client for [Tenderlane](https://github.com/farisaziz12/tenderlane).

Owns the state machine (`idle → evaluating → ready → submitting → success | error`) and exposes `subscribe` / `getSnapshot` for external store integration (React's `useSyncExternalStore`, Vue's `customRef`, Svelte stores, etc.).

## Install

```bash
npm install @tenderlane/client @tenderlane/core
```

## When to use this directly

- Building bindings for a framework that doesn't have an official Tenderlane package yet
- Driving checkout state from outside a component tree (e.g. a state library)

For React, install [`@tenderlane/react`](https://www.npmjs.com/package/@tenderlane/react). For most apps, install [`tenderlane`](https://www.npmjs.com/package/tenderlane).

## Status

Alpha. APIs may change before `1.0`.

## License

MIT
