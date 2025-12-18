# Conditional Logic System

The app now supports powerful conditional logic that allows cells to dynamically respond to conditions and execute different paths based on cell values.

## Features

1. **Conditional Value Selection**: Use `if/else/then` syntax in prompts to conditionally select values
2. **Conditional Cell Execution**: Skip cells based on conditions
3. **Rich Comparison Operators**: Support for various comparison types
4. **Visual Indicators**: Cells with conditions are visually marked

## Syntax

### Conditional Value Selection

Use `{{if:condition}}then:value{{else:value}}` syntax in your prompts:

```
{{if:A1=="success"}}then:{{B1}}{{else:{{C1}}}}
```

**Examples:**

1. **Simple equality check:**
   ```
   Write a story about {{if:A1=="fantasy"}}then:magic{{else:science}}
   ```

2. **Numeric comparison:**
   ```
   {{if:A1>10}}then:{{B1}}{{else:{{C1}}}}
   ```

3. **String contains:**
   ```
   {{if:A1 contains "error"}}then:{{B1}}{{else:{{C1}}}}
   ```

4. **Cross-sheet conditions:**
   ```
   {{if:Sheet2!A1=="ready"}}then:{{B1}}{{else:{{C1}}}}
   ```

### Conditional Cell Execution

Cells can be conditionally executed (skipped) in two ways:

#### Method 1: Condition Property

Add a `condition` property to a cell (via cell settings or programmatically):

```javascript
{
  cell_id: "B1",
  prompt: "Generate content",
  condition: "A1=='success'"  // Only run if A1 equals "success"
}
```

#### Method 2: Execution Syntax in Prompt

Use `{{if:condition}}run{{else:skip}}` in the prompt:

```
{{if:A1=="ready"}}run{{else:skip}}
Generate the final report
```

## Supported Operators

| Operator | Syntax | Description | Example |
|----------|--------|-------------|---------|
| Equals | `==` or `=` | Checks if values are equal | `A1=="success"` |
| Not Equals | `!=` | Checks if values are not equal | `A1!="error"` |
| Greater Than | `>` | Numeric comparison | `A1>10` |
| Less Than | `<` | Numeric comparison | `A1<5` |
| Greater or Equal | `>=` | Numeric comparison | `A1>=100` |
| Less or Equal | `<=` | Numeric comparison | `A1<=50` |
| Contains | ` contains ` | String contains substring | `A1 contains "error"` |
| Starts With | ` startsWith ` | String starts with | `A1 startsWith "http"` |
| Ends With | ` endsWith ` | String ends with | `A1 endsWith ".jpg"` |
| Truthy | (no operator) | Checks if value is truthy | `A1` (true if A1 has a value) |

## Examples

### Example 1: Dynamic Content Based on Status

**Cell A1:** Status check
```
Check if user is logged in
```

**Cell B1:** Conditional response
```
{{if:A1=="logged_in"}}then:Welcome back!{{else:Please log in}}
```

### Example 2: Conditional Image Selection

**Cell A1:** Theme selection
```
fantasy
```

**Cell B1:** Fantasy image prompt
```
A magical forest with unicorns
```

**Cell C1:** Sci-fi image prompt
```
A futuristic city with flying cars
```

**Cell D1:** Conditional image generation
```
Generate an image: {{if:A1=="fantasy"}}then:{{B1}}{{else:{{C1}}}}
```

### Example 3: Conditional Execution Chain

**Cell A1:** Validation result
```
success
```

**Cell B1:** (Condition: `A1=="success"`)
```
Generate the report
```

**Cell C1:** (Condition: `A1!="success"`)
```
Show error message
```

### Example 4: Numeric Threshold

**Cell A1:** Score
```
85
```

**Cell B1:** Conditional feedback
```
{{if:A1>=90}}then:Excellent!{{else:{{if:A1>=70}}then:Good{{else:Needs improvement}}}}
```

### Example 5: Cross-Sheet Conditional

**Sheet1, Cell A1:**
```
ready
```

**Sheet2, Cell B1:**
```
{{if:Sheet1!A1=="ready"}}then:{{C1}}{{else:Waiting...}}
```

## How It Works

1. **Parsing**: The system parses conditional blocks from prompts
2. **Dependency Resolution**: Dependencies in conditions are resolved first
3. **Evaluation**: Conditions are evaluated using the resolved values
4. **Selection**: The appropriate branch (then/else) is selected
5. **Execution**: For conditional execution, cells are skipped if condition is false

## Visual Indicators

- **Purple "IF" badge**: Cell contains conditional value selection (`{{if:...}}then:...{{else:...}}`)
- **Orange "COND" badge**: Cell has conditional execution (will be skipped if condition is false)

## Best Practices

1. **Always provide else values**: Even if empty, it's good practice to include `{{else:}}`
2. **Use quotes for string literals**: `A1=="success"` not `A1==success`
3. **Test conditions**: Make sure your conditions evaluate correctly before using in complex chains
4. **Combine with dependencies**: Conditions work seamlessly with the dependency system
5. **Nested conditions**: You can nest conditions, but keep them readable

## Technical Details

- Conditions are evaluated **after** dependencies are resolved
- Cell references in conditions are automatically detected as dependencies
- Skipped cells still create a generation record with status "skipped"
- Conditional execution happens before the cell actually runs (saves API calls)

