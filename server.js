import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Replicate from 'replicate'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

app.post('/generateposter', async (req, res) => {
	try {
		const {
			prompt,
			aspect_ratio = '3:2',
			generationType = 'poster',
			eventName = '',
			theme = '',
			date = '',
			eventType = '',
			extraPrompt = ''
		} = req.body || {}

		// Build a helpful default prompt if none provided
		const finalPrompt = prompt && String(prompt).trim().length > 0
			? prompt
			: buildPrompt({ generationType, eventName, theme, date, eventType, extraPrompt })
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

function buildPrompt({ generationType, eventName, theme, date, eventType, extraPrompt }) {
	const typeLabel = generationType === 'logo' ? 'Logo' : 'Poster'
	const parts = [
		`${typeLabel} design for ${eventName || 'an event'}`,
		theme ? `${theme}` : null,
		eventType ? `${eventType} theme` : null,
		date ? `Date: ${date}` : null,
		'clear readable text, modern typography, high contrast, professional composition',
		extraPrompt || null
	].filter(Boolean)
	return parts.join(', ')
}

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`))