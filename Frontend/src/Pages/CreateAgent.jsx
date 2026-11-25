import React, { useState } from 'react'
import { ArrowLeft, Bot, LoaderCircle } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { BrandMark } from '@/components/brand-mark'
import { createAgent } from '@/features/agent'
import { Button } from '@/components/ui/button'

const inputClass = 'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/10'
const availableTools = [
  { id: 'web_search', label: 'Web Search', description: 'Search web for real-time information, news, tutorials, documentation, and answers.' },
  { id: 'analyze_image', label: 'Image Analyzer', description: 'Analyze images to identify objects, understand visual content, and answer questions.' },
  { id: 'send_email', label: 'Send Email', description: 'Compose and send emails through your connected Gmail account.' },
  { id: 'create_calendar_event', label: 'Create Calendar Event', description: 'Create and schedule events in Google Calendar with titles, descriptions, dates, and times.' },
  { id: 'email_manager', label: 'Email Manager', description: 'Search and retrieve emails from your Gmail inbox, including unread messages and emails from specific senders.' },
  { id: 'calendar_manager', label: 'Calendar Manager', description: 'View and retrieve Google Calendar events, meetings, and upcoming schedules.' },
  { id: 'publish_instagram_post', label: 'Instagram Publisher', description: 'Publish images to your connected Instagram account with AI-generated or custom captions and hashtags.' },
]

function CreateAgent() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', knowledgeBase: '', instructions: '' })
  const [tools, setTools] = useState([])
  const [error, setError] = useState('')
  const [nameError, setNameError] = useState('')
  const [saving, setSaving] = useState(false)

  const updateField = (event) => {
    if (event.target.name === 'name') setNameError('')
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  const toggleTool = (toolName) => {
    setTools((current) =>
      current.includes(toolName)
        ? current.filter((item) => item !== toolName)
        : [...current, toolName]
    )
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setNameError('')

    const name = form.name.trim()
    const knowledgeBase = form.knowledgeBase.trim()
    const instructions = form.instructions.trim()

    if (!name || !knowledgeBase || !instructions) {
      setError('Name, knowledge base, and instructions are required.')
      return
    }

    setSaving(true)

    try {
      await createAgent({ name, knowledgeBase, instructions, tools })
      navigate('/agents')
    } catch (requestError) {
      const message = requestError.response?.data?.message || 'Unable to create agent. Please try again.'
      if (requestError.response?.status === 409) {
        setNameError(message)
      } else {
        setError(message)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,#2b2f3a_0%,#191b21_55%,#121317_100%)] text-white'>
      <div aria-hidden className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.35)_100%)]' />
      <main className='relative z-10 mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-12'>
        <Link to='/' className='mb-8 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white'>
          <ArrowLeft size={16} />
          Back to home
        </Link>

        <div className='mb-8 flex items-center gap-3'>
          <div className='grid size-11 place-items-center rounded-xl border border-violet-300/20 bg-[#211a35] text-violet-100 shadow-lg shadow-violet-950/30'>
            <BrandMark size={23} />
          </div>
          <div>
            <p className='text-xl font-bold tracking-[-0.05em] text-white'>Zyro<span className='text-violet-300'>AI</span></p>
            <h1 className='text-3xl font-semibold tracking-tight'>Create an agent</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className='rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-7'>
          <div className='space-y-5'>
            <label className='block'>
              <span className='mb-2 block text-sm font-medium text-zinc-200'>Agent name</span>
              <div className='relative'>
                <Bot size={16} className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500' />
                <input
                  required
                  maxLength={80}
                  name='name'
                  value={form.name}
                  onChange={updateField}
                  placeholder='e.g. Customer Support Assistant'
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={nameError ? 'agent-name-error' : undefined}
                  className={`${inputClass} h-12 pl-10 ${nameError ? 'border-red-400/60 focus:border-red-400/70 focus:ring-red-400/10' : ''}`}
                />
              </div>
              {nameError && (
                <p id='agent-name-error' role='alert' className='mt-2 text-xs text-red-400'>
                  {nameError}
                </p>
              )}
            </label>

            <label className='block'>
              <span className='mb-2 block text-sm font-medium'>Knowledge base</span>
              <textarea required name='knowledgeBase' value={form.knowledgeBase} onChange={updateField} placeholder='Describe the information this agent should know...' rows={4} className={`${inputClass} resize-y`} />
            </label>

            <label className='block'>
              <span className='mb-2 block text-sm font-medium'>Instructions</span>
              <textarea required name='instructions' value={form.instructions} onChange={updateField} placeholder='Tell your agent how to behave and respond...' rows={5} className={`${inputClass} resize-y`} />
            </label>

            <div>
              <span className='mb-2 block text-sm font-medium'>Tools</span>
              <p className='mb-3 text-xs text-zinc-500'>Select the capabilities available to your agent.</p>
              <div className='overflow-hidden rounded-2xl border border-white/10'>
                {availableTools.map((tool) => {
                  const selected = tools.includes(tool.id)
                  return (
                    <button
                      type='button'
                      key={tool.id}
                      aria-pressed={selected}
                      onClick={() => toggleTool(tool.id)}
                      className={`flex w-full items-center justify-between gap-5 px-4 py-4 text-left transition ${
                        selected
                          ? 'bg-white/[0.07] text-white'
                          : 'bg-white/[0.02] text-zinc-200 hover:bg-white/[0.05]'
                      } ${tool.id !== availableTools[0].id ? 'border-t border-white/10' : ''}`}
                    >
                      <span className='min-w-0'>
                        <span className='block text-sm font-medium'>{tool.label}</span>
                        <span className='mt-1 block text-xs leading-5 text-zinc-500'>{tool.description}</span>
                      </span>
                      <span
                        className={`grid size-5 shrink-0 place-items-center rounded-full border ${
                          selected ? 'border-violet-300 bg-violet-300' : 'border-white/25 bg-transparent'
                        }`}
                      >
                        {selected && <span className='size-2 rounded-full bg-zinc-900' />}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {error && <p role='alert' className='mt-5 text-sm text-red-400'>{error}</p>}

          <div className='mt-7 flex justify-end gap-3 border-t border-white/10 pt-5'>
            <Button type='button' variant='ghost' onClick={() => navigate(-1)} className='text-zinc-400 hover:text-white'>Cancel</Button>
            <Button type='submit' disabled={saving} className='bg-white text-zinc-900 hover:bg-zinc-200'>
              {saving && <LoaderCircle size={16} className='animate-spin' />}
              {saving ? 'Creating...' : 'Create agent'}
            </Button>
          </div>
        </form>
      </main>
    </div>
  )
}

export default CreateAgent
