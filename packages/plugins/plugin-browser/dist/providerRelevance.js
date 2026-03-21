function getMessageText(message) {
    if (!message || typeof message !== "object")
        return "";
    const content = message.content;
    if (typeof content === "string")
        return content;
    if (!content || typeof content !== "object")
        return "";
    const text = content.text;
    return typeof text === "string" ? text : "";
}
function toHaystack(message, recentMessages) {
    const recent = Array.isArray(recentMessages) ? recentMessages : [];
    return [
        getMessageText(message),
        ...recent.map((entry) => getMessageText(entry)),
    ]
        .join(" ")
        .toLowerCase();
}
export function validateActionKeywords(message, recentMessages, keywords) {
    const haystack = toHaystack(message, recentMessages);
    if (!haystack.trim())
        return true;
    return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}
export function validateActionRegex(message, recentMessages, regex) {
    const haystack = toHaystack(message, recentMessages);
    if (!haystack.trim())
        return true;
    return regex.test(haystack);
}
//# sourceMappingURL=providerRelevance.js.map