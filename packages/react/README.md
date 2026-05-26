# @tenderlane/react

React bindings for [Tenderlane](https://github.com/farisaziz12/tenderlane).

Thin wrapper over [`@tenderlane/client`](https://www.npmjs.com/package/@tenderlane/client). `TenderlaneProvider` creates the client once via `useRef`; hooks subscribe via `useSyncExternalStore`. No business logic lives here.

## Install

```bash
npm install @tenderlane/react @tenderlane/client @tenderlane/core react
```

## Quick start

```tsx
import { TenderlaneProvider, useCheckout } from "@tenderlane/react";

function Checkout() {
  const { submit, state } = useCheckout();
  return <button onClick={() => submit({ items: [{ sku: "pro", quantity: 1 }] })}>Pay</button>;
}

export default function App() {
  return (
    <TenderlaneProvider config={config}>
      <Checkout />
    </TenderlaneProvider>
  );
}
```

Most apps should install [`tenderlane`](https://www.npmjs.com/package/tenderlane) instead — it re-exports React bindings under `tenderlane/react`.

## Status

Alpha. APIs may change before `1.0`.

## License

MIT
