import './NumericKeypad.css'

interface Props {
  onKey: (key: string) => void
  disabled?: boolean
  decimal?: boolean
  className?: string
}

export default function NumericKeypad({ onKey, disabled, decimal, className = '' }: Props) {
  const keys = decimal
    ? ['1', '2', '3', 'delete', '4', '5', '6', 'clear', '7', '8', '9', '.', '0']
    : ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'delete']
  return (
    <div
      className={`numeric-keypad ${decimal ? 'numeric-keypad--decimal' : ''} ${className}`}
      role="group"
      aria-label="Answer number pad"
    >
      {keys.map((key) => (
        <button
          type="button"
          key={key}
          disabled={disabled}
          onClick={() => onKey(key)}
          aria-label={
            key === 'clear'
              ? 'Clear answer'
              : key === 'delete'
                ? 'Delete last digit'
                : key === '.'
                  ? 'Decimal point'
                  : key
          }
          className={key.length > 1 ? 'numeric-keypad__utility' : ''}
        >
          {key === 'clear' ? 'CLR' : key === 'delete' ? '⌫' : key}
        </button>
      ))}
    </div>
  )
}
