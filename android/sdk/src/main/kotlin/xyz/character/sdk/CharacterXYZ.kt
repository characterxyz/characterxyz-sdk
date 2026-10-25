package xyz.character.sdk

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Character XYZ for Android — SCAFFOLD.
 *
 * Today: the session description and the agent card, the same contract as the
 * web SDK (`spec/sdk-v1.openapi.yaml`). Next: streamed chat, calls (the agent
 * socket + AudioRecord at 16 kHz), a Compose view. Apps have no Origin, so
 * sessions are minted on the app's own server with a secret key and the token
 * is passed in here.
 */
object CharacterXYZVersion {
    const val CURRENT = "0.7.1"
}

data class AgentCard(val id: String, val name: String, val tagline: String)

data class Features(val chat: Boolean, val call: Boolean, val maxCallMinutes: Int)

data class Session(
    val token: String,
    val expiresAt: Long,
    val visitorId: String,
    val agent: AgentCard,
    val features: Features,
)

class CharacterXYZException(val status: Int, message: String) : Exception(message)

class CharacterXYZClient(private val apiUrl: String = "https://api.character.xyz") {

    /** What a token minted by your server unlocks (`GET /sdk/v1/session`). */
    suspend fun describe(sessionToken: String): Session = withContext(Dispatchers.IO) {
        val conn = URL("${apiUrl.trimEnd('/')}/sdk/v1/session").openConnection() as HttpURLConnection
        try {
            conn.setRequestProperty("Authorization", "Bearer $sessionToken")
            conn.connectTimeout = 10_000
            conn.readTimeout = 15_000
            val status = conn.responseCode
            val body = (if (status in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            val json = if (body.isNotEmpty()) JSONObject(body) else JSONObject()
            if (status !in 200..299) throw CharacterXYZException(status, json.optString("message", "Request failed"))
            parseSession(json.getJSONObject("data"))
        } finally {
            conn.disconnect()
        }
    }

    internal fun parseSession(d: JSONObject): Session {
        val agent = d.getJSONObject("agent")
        val features = d.getJSONObject("features")
        return Session(
            token = d.optString("token"),
            expiresAt = d.getLong("expiresAt"),
            visitorId = d.getString("visitorId"),
            agent = AgentCard(agent.getString("id"), agent.getString("name"), agent.optString("tagline")),
            features = Features(features.getBoolean("chat"), features.getBoolean("call"), features.optInt("maxCallMinutes")),
        )
    }
}
