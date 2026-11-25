import React, { useEffect, useState } from 'react'
import { ArrowLeft, Bot, LoaderCircle, Plus, Search, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { BrandMark } from '@/components/brand-mark'
import { deleteAgent, getAllAgents } from '@/features/agent'
import { useDispatch, useSelector } from 'react-redux'
import { setAgents, setAgentsLoading, setSelectedAgent } from '@/redux/agentSlice'

const toolLabels = {
  'web-search': 'Web Search',
  calculator: 'Calculator',
  gmail: 'Gmail',
  'google-calendar': 'Google Calendar',
  slack: 'Slack',
  'google-sheets': 'Google Sheets',
  web_search: 'Web Search',
  analyze_image: 'Image Analyzer',
  send_email: 'Send Email',
  create_calendar_event: 'Create Calendar Event',
  email_manager: 'Email Manager',
  calendar_manager: 'Calendar Manager',
  publish_instagram_post: 'Instagram Publisher',
}

function Agents() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { agents, agentsLoading: loading } = useSelector((state) => state.agent)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true
    dispatch(setAgentsLoading(true))

    const fetchAgents = async () => {
      try {
        const data = await getAllAgents()
        if (active) dispatch(setAgents(Array.isArray(data) ? data : []))
      } catch (requestError) {
        if (active) {
          setError(requestError.response?.data?.message || 'Unable to load your agents.')
        }
      } finally {
        if (active) dispatch(setAgentsLoading(false))
      }
    }

    fetchAgents()
    return () => {
      active = false
    }
  }, [])

  const filteredAgents = agents.filter((agent) => {
    const query = search.trim().toLowerCase()
    if (!query) return true

    const tools = Array.isArray(agent.tools) ? agent.tools.join(' ') : ''
    return [
      agent.name,
      agent.instructions,
      agent.knowledgeBase,
      tools,
    ].some((value) => typeof value === 'string' && value.toLowerCase().includes(query))
  })

  const handleDelete = async (agent) => {
    const confirmed = window.confirm(`Delete "${agent.name}"?`)
    if (!confirmed) return

    try {
      await deleteAgent(agent._id)
      dispatch(setAgents(agents.filter((item) => item._id !== agent._id)))
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to delete this agent.')
    }
  }

  return (
    <div className='relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,#2b2f3a_0%,#191b21_55%,#121317_100%)] text-white'>
      <div aria-hidden className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.35)_100%)]' />

      <main className='relative z-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12'>
        <header className='mb-10 flex min-h-[4.5rem] items-center justify-between'>
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

        <div className='mb-7'>
          <p className='mb-2 text-xs font-medium uppercase tracking-[0.18em] text-violet-300'>Agent workspace</p>
          <h1 className='text-3xl font-semibold tracking-tight'>My Agents</h1>
          <p className='mt-2 text-sm text-zinc-400'>Manage your AI agents and create a new one.</p>
        </div>

        <div className='relative mb-6'>
          <Search size={17} className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500' />
          <input
            type='search'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder='Search agents...'
            className='h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm text-white outline-none placeholder:text-zinc-500 backdrop-blur-xl focus:border-violet-400/50 focus:ring-2 focus:ring-violet-400/10'
          />
        </div>

        {error && (
          <div className='mb-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300'>
            {error}
          </div>
        )}

        {loading ? (
          <div className='grid min-h-52 place-items-center'>
            <LoaderCircle size={24} className='animate-spin text-zinc-400' />
          </div>
        ) : (
          <section className='grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
            {filteredAgents.map((agent) => (
              <article
                key={agent._id}
                onClick={() => {
                  dispatch(setSelectedAgent(agent))
                  navigate('/')
                }}
                className='group min-h-52 rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.06]'
              >
                <div className='flex items-start justify-between gap-3'>
                  <div className='grid size-11 place-items-center rounded-xl bg-violet-400/15 text-violet-300'>
                    <Bot size={21} />
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] ${agent.isActive ? 'bg-emerald-400/10 text-emerald-300' : 'bg-zinc-400/10 text-zinc-400'}`}>
                      {agent.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      type='button'
                      aria-label={`Delete ${agent.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleDelete(agent)
                      }}
                      className='grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400'
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <h2 className='mt-5 truncate text-base font-medium'>{agent.name}</h2>
                <p className='mt-2 text-[11px] font-medium uppercase tracking-wide text-violet-300'>
                  Instructions
                </p>
                <p className='mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-500'>
                  {agent.instructions || 'No instructions configured.'}
                </p>
                <p className='mt-3 text-[11px] font-medium uppercase tracking-wide text-violet-300'>
                  Knowledge base
                </p>
                <p className='mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-500'>
                  {agent.knowledgeBase || 'No knowledge base configured.'}
                </p>
                {Array.isArray(agent.tools) && agent.tools.length > 0 && (
                  <div className='mt-4 flex flex-wrap gap-2'>
                    {agent.tools.slice(0, 3).map((tool) => (
                      <span key={tool} className='rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-zinc-400'>
                        {toolLabels[tool] || tool.replace(/[-_]/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}

            {filteredAgents.length === 0 && search.trim() && (
              <div className='grid min-h-52 place-items-center rounded-2xl border border-white/10 bg-white/[0.025] p-6 text-center'>
                <div>
                  <Search size={20} className='mx-auto text-zinc-500' />
                  <p className='mt-3 text-sm font-medium'>No agents found</p>
                  <button
                    type='button'
                    onClick={() => setSearch('')}
                    className='mt-2 text-xs text-violet-300 hover:text-violet-200'
                  >
                    Clear search
                  </button>
                </div>
              </div>
            )}

            {filteredAgents.length === 0 && !search.trim() && (
              <div className='grid min-h-52 place-items-center rounded-2xl border border-white/10 bg-white/[0.025] p-6 text-center'>
                <div>
                  <Bot size={20} className='mx-auto text-zinc-500' />
                  <p className='mt-3 text-sm font-medium'>No agents created yet</p>
                  <p className='mt-2 text-xs text-zinc-500'>
                    Create an agent to see its instructions, knowledge base, and tools here.
                  </p>
                </div>
              </div>
            )}

            <Link
              to='/agents/new'
              className='grid min-h-52 place-items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.025] p-5 text-zinc-400 transition hover:border-violet-400/40 hover:bg-violet-400/[0.06] hover:text-white'
            >
              <span className='flex flex-col items-center text-center'>
                <span className='grid size-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04]'>
                  <Plus size={20} />
                </span>
                <span className='mt-3 text-sm font-medium'>Create new agent</span>
              </span>
            </Link>
          </section>
        )}
      </main>
    </div>
  )
}

export default Agents
