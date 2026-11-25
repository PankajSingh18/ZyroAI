import React, { useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, Check, ExternalLink, LoaderCircle, Mail } from 'lucide-react'
import { FaInstagram } from 'react-icons/fa'
import { Link, useSearchParams } from 'react-router-dom'
import { BrandMark } from '@/components/brand-mark'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  connectGoogle,
  connectInstagram,
  disconnectGoogle,
  disconnectInstagram,
  getAllIntegrations,
} from '@/features/integration'

const integrationList = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Send and manage emails through your AI agent.',
    icon: Mail,
    provider: 'google',
  },
  {
    id: 'googleCalendar',
    name: 'Google Calendar',
    description: 'Manage calendar events using your AI agent.',
    icon: CalendarDays,
    provider: 'google',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'Publish posts and connect your Instagram account.',
    icon: FaInstagram,
    provider: 'instagram',
  },
]

function Integration() {
  const [searchParams] = useSearchParams()
  const [connectedServices, setConnectedServices] = useState([])
  const [integrations, setIntegrations] = useState({})
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(null)
  const [disconnecting, setDisconnecting] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const fetchAllIntegrations = async () => {
    try {
      const data = await getAllIntegrations()
      setIntegrations(data || {})
      const services = []
      if (data?.gmail?.connected) services.push("gmail")
      if (data?.google_calendar?.connected) services.push("google_calendar")
      if (data?.instagram?.connected) services.push("instagram")

      if (Array.isArray(data?.integrations)) {
        for (const item of data.integrations) {
          for (const service of item.services || []) {
            services.push(service)
          }
        }
      }

      setConnectedServices([...new Set(services)])
      return true
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load integrations.')
      return false
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllIntegrations()

    if (searchParams.get('google') === 'connected') {
      setSuccess('Google integration connected successfully.')
    }
    if (searchParams.get('instagram') === 'connected') {
      setSuccess('Instagram integration connected successfully.')
    }
  }, [searchParams])

  const handleConnect = async (id) => {
    if (id === 'instagram') {
      setError('')
      setSuccess('')
      setConnecting(id)
      try {
        const data = await connectInstagram()
        if (!data.url) {
          throw new Error('Instagram authorization URL not received.')
        }
        window.location.assign(data.url)
      } catch (requestError) {
        setError(requestError.response?.data?.message || requestError.message || 'Unable to connect Instagram.')
      } finally {
        setConnecting(null)
      }
      return
    }

    if (id === 'gmail' || id === 'googleCalendar') {
      setError('')
      setSuccess('')
      setConnecting(id)
      try {
        const data = await connectGoogle()
        if (!data.url) {
          throw new Error('Google authorization URL not received.')
        }
        window.location.assign(data.url)
      } catch (requestError) {
        setError(requestError.response?.data?.message || requestError.message || 'Unable to connect Google.')
        setConnecting(null)
      }
    }
  }

  const handleDisconnect = async (id) => {
    const providerName =
      id === 'instagram'
        ? 'Instagram'
        : id === 'gmail'
          ? 'Gmail'
          : 'Google Calendar'
    if (!window.confirm(`Are you sure you want to disconnect ${providerName}?`)) return

    setDisconnecting(id)
    setError('')
    setSuccess('')
    try {
      if (id === 'instagram') {
        await disconnectInstagram()
      } else {
        await disconnectGoogle()
      }
      const refreshed = await fetchAllIntegrations()
      setSuccess(
        refreshed
          ? `${providerName} disconnected successfully.`
          : 'Disconnected successfully.'
      )
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
        `Unable to disconnect ${providerName}.`
      )
    } finally {
      setDisconnecting(null)
    }
  }

  const isConnected = (item) => {
    if (item.id === 'gmail') return connectedServices.includes('gmail')
    if (item.id === 'googleCalendar') return connectedServices.includes('google_calendar')
    return connectedServices.includes('instagram')
  }

  return (
    <div className='relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,#2b2f3a_0%,#191b21_55%,#121317_100%)] text-white'>
      <div aria-hidden='true' className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.35)_100%)]' />
      <header className='relative z-10 flex h-[4.5rem] items-center justify-between px-4 sm:px-6'>
        <Link to='/' className='flex items-center gap-3'>
          <span className='grid size-10 place-items-center rounded-xl border border-violet-300/20 bg-[#211a35] text-violet-100 shadow-lg shadow-violet-950/30'>
            <BrandMark size={23} />
          </span>
          <span className='text-3xl font-bold tracking-[-0.06em] text-white'>Zyro<span className='text-violet-300'>AI</span></span>
        </Link>
        <Link to='/' className='inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-white'>
          <ArrowLeft size={16} />
          Back to home
        </Link>
      </header>
      <Separator className='relative z-10 bg-white/10' />

      <main className='relative z-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12'>
        <div className='mb-8'>
          <h1 className='text-3xl font-semibold tracking-tight'>Integrations</h1>
          <p className='mt-2 text-sm text-zinc-400'>Connect external tools and services to your AI agent.</p>
        </div>

        {error && (
          <div className='mb-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300'>
            {error}
          </div>
        )}
        {success && (
          <div className='mb-5 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300'>
            <Check size={16} />
            {success}
          </div>
        )}

        {loading ? (
          <div className='grid min-h-52 place-items-center'>
            <LoaderCircle size={24} className='animate-spin text-zinc-400' />
          </div>
        ) : (
          <section className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {integrationList.map((item) => {
              const Icon = item.icon
              const connected = isConnected(item)
              const status =
                item.id === 'gmail'
                  ? integrations?.gmail
                  : item.id === 'googleCalendar'
                    ? integrations?.google_calendar
                    : integrations?.instagram
              const accountLabel =
                status?.email ||
                status?.username ||
                status?.displayName ||
                ''
              const isConnecting = connecting === item.id
              const isDisconnecting = disconnecting === item.id
              return (
                <Card
                  key={item.id}
                  className='rounded-2xl border border-white/10 bg-white/[0.04] text-white shadow-[0_20px_60px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-white/25 hover:bg-white/[0.06]'
                >
                  <CardHeader className='flex flex-row items-start justify-between gap-4'>
                    <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-zinc-900 shadow-[0_8px_24px_rgba(255,255,255,0.1)]'>
                      <Icon className='h-5 w-5' />
                    </div>
                    <span className={`border px-2.5 py-1 text-[11px] ${
                      connected
                        ? 'rounded-full border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                        : 'rounded-full border-white/10 text-zinc-500'
                    }`}>
                      {connected ? 'Connected' : 'Not connected'}
                    </span>
                  </CardHeader>
                  <CardContent className='flex flex-1 flex-col'>
                    <CardTitle className='text-base font-medium text-white'>
                      {item.name}
                    </CardTitle>
                    <CardDescription className='mt-2 min-h-12 max-w-md leading-relaxed text-zinc-400'>
                      {item.description}
                    </CardDescription>

                    {connected && (
                      <div className='mb-5 mt-1 flex items-center gap-2 border-t border-white/10 pt-4 text-xs text-zinc-400'>
                        <span className='grid h-6 w-6 place-items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-300'>
                          <Check className='h-3 w-3' />
                        </span>
                        {accountLabel || 'Account connected'}
                      </div>
                    )}

                    <div className='mt-auto flex gap-2'>
                      {connected ? (
                        <Button
                          variant='outline'
                          disabled={isDisconnecting}
                          onClick={() => handleDisconnect(item.id)}
                          className='h-10 w-full rounded-xl border-red-400/20 bg-red-400/10 text-red-300 hover:border-red-400/40 hover:bg-red-400/20 hover:text-red-200'
                        >
                          {isDisconnecting ? (
                            <>
                              <LoaderCircle className='h-4 w-4 animate-spin' />
                              Disconnecting...
                            </>
                          ) : (
                            'Disconnect'
                          )}
                        </Button>
                      ) : (
                        <Button
                          variant='outline'
                          disabled={isConnecting}
                          onClick={() => handleConnect(item.id)}
                          className='h-10 w-full rounded-xl border-0 bg-white text-zinc-900 hover:bg-zinc-200'
                        >
                          {isConnecting ? (
                            <>
                              <LoaderCircle className='h-4 w-4 animate-spin' />
                              Connecting...
                            </>
                          ) : (
                            <>
                              Connect
                              <ExternalLink className='h-4 w-4' />
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </section>
        )}
      </main>
    </div>
  )
}

export default Integration
