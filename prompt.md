# State Synchronization Library Usage Guide

This library provides synchronized state management across multiple clients using Ably as the real-time backend. It implements a reducer pattern similar to Redux, but with automatic synchronization between clients.

## Installation

```javascript
import { setup } from 'https://jeffreyyoung.com/state-lib/v1';
```

## Basic Usage

```javascript
// Define your reducer function
const reducer = (state, action) => {
  switch (action.type) {
    case 'INCREMENT':
      return { ...state, count: state.count + 1 };
    case 'DECREMENT':
      return { ...state, count: state.count - 1 };
    default:
      return state;
  }
};

// Set up the synchronized state
const { subscribe, dispatch } = setup({
  reducer,
  initialState: { count: 0 }
});

// Subscribe to state changes
const unsubscribe = subscribe((state) => {
  console.log('Current state:', state);
});

// Dispatch actions
dispatch({ type: 'INCREMENT' });
dispatch({ type: 'DECREMENT' });

// Clean up when done
unsubscribe();
```

## Key Features

1. **Automatic Synchronization**: State changes are automatically synchronized across all connected clients
2. **Optimistic Updates**: Actions are applied immediately locally and then confirmed by the server
3. **Reducer Pattern**: Uses a familiar reducer pattern for state management
4. **Type Safety**: Written in TypeScript for better type safety

## API Reference

### `setup(options: SetupOptions)`

Creates a new synchronized state instance.

Options:
- `reducer`: A function that takes the current state and an action, and returns the new state
- `initialState`: The initial state object

Returns an object with:
- `subscribe`: Function to subscribe to state changes
- `dispatch`: Function to dispatch actions

### `subscribe(listener: (state: any) => void)`

Subscribe to state changes. Returns an unsubscribe function.

### `dispatch(action: any)`

Dispatch an action to update the state. The action will be synchronized across all clients.

## Best Practices

1. Keep your reducer pure and predictable
2. Use TypeScript for better type safety
3. Always clean up subscriptions when they're no longer needed
4. Handle loading and error states in your UI
5. Consider using action types as constants to prevent typos

## Example with TypeScript

```typescript
interface State {
  count: number;
  todos: string[];
}

type Action = 
  | { type: 'INCREMENT' }
  | { type: 'DECREMENT' }
  | { type: 'ADD_TODO'; text: string };

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'INCREMENT':
      return { ...state, count: state.count + 1 };
    case 'DECREMENT':
      return { ...state, count: state.count - 1 };
    case 'ADD_TODO':
      return { ...state, todos: [...state.todos, action.text] };
    default:
      return state;
  }
};

const { subscribe, dispatch } = setup({
  reducer,
  initialState: { count: 0, todos: [] }
});
```

## Error Handling

The library automatically handles:
- Network disconnections
- Action conflicts
- State synchronization
- Optimistic updates

## Limitations

1. Requires an active internet connection
2. Actions are processed in order of receipt
3. State must be serializable
4. Large state objects may impact performance

## Security Considerations

1. The library uses Ably for real-time communication
2. Each state space is isolated using a hash of the reducer function
3. Consider implementing additional security measures for sensitive data