applyTo: "app/components/**,app/components-react/**"

# Tracking RxJS subscriptions

When code reviewing a PR, check that any RxJS subscriptions created in components are tied to the component lifecycle and will be unsubscribed or otherwise cleaned up.

Flag subscriptions that can outlive the component, are created without teardown, or are not bound through an established cleanup pattern.

## `useSubscription` guidance

When reviewing a PR, judge whether `useSubscription` is the better fit than a manual effect-based subscription, and explain why in your review if it is not.

Using `useSubscription` is acceptable when the observable and callback are stable for the lifetime of the component and the intended behavior is subscribe-on-mount and unsubscribe-on-unmount.

Flag uses of `useSubscription` when the observable, callback, or subscription behavior is expected to change with props/state over time, because those cases should use an effect with correct dependencies (or equivalent stream lifecycle handling) so the subscription can be re-bound correctly.

`useSubscription` should only replace the subscription part of an effect. If the effect also performs other mount-time setup or needs extra teardown, keep a manual `useEffect` and use the hook only for the listener.
