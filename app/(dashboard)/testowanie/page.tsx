'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Beaker, AlertTriangle, CheckCircle2, FileText } from 'lucide-react'
import { getSettlementGroups } from '@/app/(dashboard)/media/actions'
import { generateTestMediaCharge } from './actions'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function TestowaniePage() {
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success?: boolean; generated?: number; error?: string } | null>(null)
  
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [mediaAmount, setMediaAmount] = useState<string>('100.00')
  const [mediaLoading, setMediaLoading] = useState(false)
  const [mediaResult, setMediaResult] = useState<{ success?: boolean; generated?: number; error?: string } | null>(null)

  useEffect(() => {
    getSettlementGroups().then(setGroups).catch(console.error)
  }, [])

  const handleTestCron = async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/cron/generate-rents?month=${month}&year=${year}`)
      const data = await res.json()
      
      if (res.ok) {
        setResult({ success: true, generated: data.generated })
      } else {
        setResult({ error: data.error || 'Wystąpił nieznany błąd' })
      }
    } catch (err: unknown) {
      setResult({ error: err instanceof Error ? err.message : 'Wystąpił błąd' })
    } finally {
      setLoading(false)
    }
  }

  const handleTestMediaCharge = async () => {
    if (!selectedGroup || !mediaAmount) return
    setMediaLoading(true)
    setMediaResult(null)
    try {
      const res = await generateTestMediaCharge(
        parseInt(selectedGroup),
        parseFloat(mediaAmount.replace(',', '.')),
        month,
        year
      )
      setMediaResult({ success: true, generated: res.count })
    } catch (err: any) {
      setMediaResult({ error: err.message || 'Wystąpił błąd' })
    } finally {
      setMediaLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Beaker className="h-8 w-8 text-yellow-500" />
          Narzędzia Testowe
        </h1>
        <p className="text-muted-foreground mt-2">
          Ta zakładka jest widoczna tylko w środowisku deweloperskim lub na odpowiednio skonfigurowanym preview.
        </p>
      </div>

      <Card className="border-yellow-500/50 shadow-sm">
        <CardHeader className="bg-yellow-50/50 dark:bg-yellow-950/20 border-b border-yellow-100 dark:border-yellow-900/50">
          <CardTitle className="text-yellow-800 dark:text-yellow-500 flex items-center gap-2">
            Wymuś generowanie czynszów (Cron Job)
          </CardTitle>
          <CardDescription>
            Symuluje działanie zadania CRON dla wybranego miesiąca i roku.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="month">Miesiąc (1-12)</Label>
              <Input 
                id="month" 
                type="number" 
                min={1} 
                max={12} 
                value={month} 
                onChange={(e) => setMonth(parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Rok</Label>
              <Input 
                id="year" 
                type="number" 
                min={2000} 
                value={year} 
                onChange={(e) => setYear(parseInt(e.target.value))}
              />
            </div>
          </div>
          
          <Button 
            onClick={handleTestCron} 
            disabled={loading}
            className="w-full bg-yellow-500 hover:bg-yellow-600 text-yellow-950 font-semibold mt-2"
          >
            {loading ? 'Generowanie...' : `Wygeneruj czynsze dla ${month}/${year}`}
          </Button>

          {result && (
            <div className={`p-4 rounded-md mt-4 flex items-start gap-3 ${result.success ? 'bg-green-50 text-green-900 border border-green-200' : 'bg-red-50 text-red-900 border border-red-200'}`}>
              {result.success ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium">Sukces!</p>
                    <p className="text-sm text-green-800">Pomyślnie wygenerowano {result.generated} czynszów.</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="font-medium">Błąd</p>
                    <p className="text-sm text-red-800">{result.error}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-purple-500/50 shadow-sm">
        <CardHeader className="bg-purple-50/50 dark:bg-purple-950/20 border-b border-purple-100 dark:border-purple-900/50">
          <CardTitle className="text-purple-800 dark:text-purple-500 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Wystaw testowe obciążenie (Media)
          </CardTitle>
          <CardDescription>
            Tworzy notę obciążeniową w bazie dla wszystkich przypisanych najemców z wybranej grupy.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label>Grupa rozliczeniowa</Label>
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz grupę..." />
              </SelectTrigger>
              <SelectContent>
                {groups.map(g => (
                  <SelectItem key={g.id} value={g.id.toString()}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Kwota obciążenia (dla każdego najemcy)</Label>
            <Input 
              type="number" 
              step="0.01"
              value={mediaAmount}
              onChange={e => setMediaAmount(e.target.value)}
            />
          </div>

          <Button 
            onClick={handleTestMediaCharge} 
            disabled={mediaLoading || !selectedGroup}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold mt-2"
          >
            {mediaLoading ? 'Wystawianie...' : `Wystaw obciążenia dla ${month}/${year}`}
          </Button>

          {mediaResult && (
            <div className={`p-4 rounded-md mt-4 flex items-start gap-3 ${mediaResult.success ? 'bg-green-50 text-green-900 border border-green-200' : 'bg-red-50 text-red-900 border border-red-200'}`}>
              {mediaResult.success ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium">Sukces!</p>
                    <p className="text-sm text-green-800">Wystawiono testowe obciążenia dla {mediaResult.generated} najemców.</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="font-medium">Błąd</p>
                    <p className="text-sm text-red-800">{mediaResult.error}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-blue-500/50 shadow-sm">
        <CardHeader className="bg-blue-50/50 dark:bg-blue-950/20 border-b border-blue-100 dark:border-blue-900/50">
          <CardTitle className="text-blue-800 dark:text-blue-500 flex items-center gap-2">
            Zmień datę dla linków najemców (Media)
          </CardTitle>
          <CardDescription>
            Pozwala &quot;oszukać&quot; serwer i przetestować, co zobaczy najemca wchodzący w link do mediów o danej dacie.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="overrideDate">Symulowana data (YYYY-MM-DD)</Label>
            <Input 
              id="overrideDate" 
              type="date"
              onChange={(e) => {
                if (e.target.value) {
                  document.cookie = `bmt_test_date=${e.target.value}; path=/; max-age=86400`
                  alert('Data została nadpisana! Otwórz link do mediów w nowej karcie tej przeglądarki.')
                }
              }}
            />
          </div>
          <Button 
            variant="outline"
            className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
            onClick={() => {
              document.cookie = "bmt_test_date=; path=/; max-age=0"
              alert('Symulacja daty wyłączona. System wrócił do prawdziwego czasu.')
            }}
          >
            Zresetuj do prawdziwej daty
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
