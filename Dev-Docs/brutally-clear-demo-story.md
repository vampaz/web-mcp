# Brutally Clear Demo Story

## Audience

Developer-tool buyers and technical founders evaluating whether WebMCP Kit can make existing web-app workflows callable by agents without losing app ownership of validation, confirmation, authorization, or execution.

## First 60 Seconds

1. Land on Inventory and run `Select all French items`.
2. See that natural language became `select_items({ ids: [...] })`.
3. Notice that the selected checkboxes are ordinary app state, not a separate agent UI.
4. Move to Invoices and run `Mark Stark Industries invoices as paid`.
5. See the chained plan stop at approval before a business mutation.

## Route Proof Points

| Route     | Proves                                                | Canonical Command                        |
| --------- | ----------------------------------------------------- | ---------------------------------------- |
| Inventory | Page-scoped context and narrow selection tools        | `Select all French items`                |
| Invoices  | Chained plans plus confirmation for sensitive changes | `Mark Stark Industries invoices as paid` |
| Commerce  | Guards block unsafe purchase actions                  | `Add 20 keyboard kits to the cart`       |
| Support   | Existing forms and queues can become app-owned tools  | `Create a support ticket`                |

## Success Criteria

- A viewer can explain the product as "typed, safe app actions for browser agents" without opening the README.
- Each page names what context the planner sees, what tools it can call, and what boundary keeps the app in control.
- The latest result shows the selected tool and planned input after every command.
- Mutating flows make approval feel like a core product feature.
