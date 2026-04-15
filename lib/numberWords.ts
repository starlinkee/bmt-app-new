const ONES = [
  '', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć',
  'dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście', 'piętnaście',
  'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście',
]

const TENS = [
  '', '', 'dwadzieścia', 'trzydzieści', 'czterdzieści', 'pięćdziesiąt',
  'sześćdziesiąt', 'siedemdziesiąt', 'osiemdziesiąt', 'dziewięćdziesiąt',
]

const HUNDREDS = [
  '', 'sto', 'dwieście', 'trzysta', 'czterysta', 'pięćset',
  'sześćset', 'siedemset', 'osiemset', 'dziewięćset',
]

function threeDigits(n: number): string {
  const h = Math.floor(n / 100)
  const rest = n % 100
  const t = Math.floor(rest / 10)
  const o = rest % 10

  const parts: string[] = []
  if (h) parts.push(HUNDREDS[h])
  if (rest < 20) {
    if (rest > 0) parts.push(ONES[rest])
  } else {
    if (t) parts.push(TENS[t])
    if (o) parts.push(ONES[o])
  }
  return parts.join(' ')
}

function thousandsForm(n: number): string {
  if (n === 1) return 'tysiąc'
  const lastTwo = n % 100
  const lastOne = n % 10
  if (lastTwo >= 12 && lastTwo <= 14) return `${threeDigits(n)} tysięcy`
  if (lastOne >= 2 && lastOne <= 4) return `${threeDigits(n)} tysiące`
  return `${threeDigits(n)} tysięcy`
}

export function amountToWordsPLN(amount: number): string {
  const totalGrosze = Math.round(amount * 100)
  const zlote = Math.floor(totalGrosze / 100)
  const grosze = totalGrosze % 100

  if (zlote === 0) {
    return `zero złotych ${String(grosze).padStart(2, '0')}/100`
  }

  const millions = Math.floor(zlote / 1_000_000)
  const thousands = Math.floor((zlote % 1_000_000) / 1_000)
  const rest = zlote % 1_000

  const parts: string[] = []

  if (millions > 0) {
    const mWord = threeDigits(millions)
    const lastTwo = millions % 100
    const lastOne = millions % 10
    if (millions === 1) parts.push('milion')
    else if (lastTwo >= 12 && lastTwo <= 14) parts.push(`${mWord} milionów`)
    else if (lastOne >= 2 && lastOne <= 4) parts.push(`${mWord} miliony`)
    else parts.push(`${mWord} milionów`)
  }

  if (thousands > 0) {
    parts.push(thousandsForm(thousands))
  }

  if (rest > 0) {
    parts.push(threeDigits(rest))
  }

  const lastTwo = zlote % 100
  const lastOne = zlote % 10
  let zloteForm: string
  if (zlote === 1) zloteForm = 'złoty'
  else if (lastTwo >= 12 && lastTwo <= 14) zloteForm = 'złotych'
  else if (lastOne >= 2 && lastOne <= 4) zloteForm = 'złote'
  else zloteForm = 'złotych'

  return `${parts.join(' ')} ${zloteForm} ${String(grosze).padStart(2, '0')}/100`
}
