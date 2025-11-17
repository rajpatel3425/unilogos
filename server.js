import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Replicate from 'replicate'
import crypto from 'crypto'
//
//
const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

// Simple in-memory user store (in production, use a database)
const users = new Map()

// ============= AUTH ENDPOINTS =============

app.post('/auth/signup', (req, res) => {
	try {
		const { email, password } = req.body

		if (!email || !password) {
			return res.status(400).json({ error: 'Email and password required' })
		}

		if (users.has(email)) {
			return res.status(409).json({ error: 'Email already exists' })
		}

		const userId = crypto.randomBytes(8).toString('hex')
		const hashedPassword = hashPassword(password)

		users.set(email, { userId, password: hashedPassword })

		const token = generateToken(userId, email)
		return res.json({ userId, token })
	} catch (e) {
		console.error('signup error', e)
		return res.status(500).json({ error: 'signup_failed' })
	}
})

app.post('/auth/login', (req, res) => {
	try {
		const { email, password } = req.body

		if (!email || !password) {
			return res.status(400).json({ error: 'Email and password required' })
		}

		const user = users.get(email)
		if (!user) {
			return res.status(401).json({ error: 'Invalid email or password' })
		}

		if (!verifyPassword(password, user.password)) {
			return res.status(401).json({ error: 'Invalid email or password' })
		}

		const token = generateToken(user.userId, email)
		return res.json({ userId: user.userId, token })
	} catch (e) {
		console.error('login error', e)
		return res.status(500).json({ error: 'login_failed' })
	}
})

// ============= GENERATION ENDPOINT =============

app.post('/generateposter', async (req, res) => {
	try {
		const {
			prompt,
			aspect_ratio = '3:2',
			generationType = 'poster',
			eventName = '',
			theme = '',
			location = '',
			date = '',
			eventType = '',
			extraPrompt = ''
		} = req.body || {}

		// Build a helpful default prompt if none provided
		const finalPrompt = prompt && String(prompt).trim().length > 0
			? prompt
			: buildPrompt({ generationType, eventName, theme, location, date, eventType, extraPrompt })
		if (!finalPrompt) return res.status(400).json({ error: 'missing_prompt' })

		const input = { prompt: finalPrompt, aspect_ratio }
		const output = await replicate.run('ideogram-ai/ideogram-v3-turbo', { input })

		// Normalize output to an href string
		let href = null
		try {
			if (output?.url) {
				href = typeof output.url === 'function' ? output.url().href : output.url
			} else if (Array.isArray(output)) {
				href = output[0]?.url || output[0]
			} else if (output?.image) {
				href = output.image
			} else if (output?.images && Array.isArray(output.images)) {
				href = output.images[0]
			}
		} catch (_) { }

		if (!href) return res.status(502).json({ error: 'unexpected_output_shape', output })
		return res.json({ href })
	} catch (e) {
		console.error('generateposter error', e)
		return res.status(500).json({ error: 'generation_failed', detail: e.message })
	}
})

// ============= HELPER FUNCTIONS =============

function buildPrompt({ generationType, eventName, theme, location, date, eventType, extraPrompt }) {
	const typeLabel = generationType === 'logo' ? 'Logo' : 'Poster'
	const parts = [
		`${typeLabel} design for ${eventName || 'an event'}`,
		theme ? `${theme}` : null,
		location ? `Location: ${location}` : null,
		eventType ? `${eventType} theme` : null,
		date ? `Date: ${date}` : null,
		'clear readable text, modern typography, high contrast, professional composition',
		extraPrompt || null
	].filter(Boolean)
	return parts.join(', ')
}

function hashPassword(password) {
	return crypto.createHash('sha256').update(password).digest('hex')
}

function verifyPassword(password, hash) {
	return hashPassword(password) === hash
}

function generateToken(userId, email) {
	return crypto.randomBytes(32).toString('hex')
}

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`))
