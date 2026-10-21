// Only dispatch-verified identity headers are used. Never accept identity from
// request bodies, query parameters, or a shared anonymous workspace.
export function workspaceOwner(request: Request, config: { ownerEmail?: string; ownerId?: string }, development = false) {
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  const configuredEmail = config.ownerEmail?.trim().toLowerCase();
  // Older Sites dispatchers may forward email without a stable user-id header.
  // Map only the explicitly configured Site owner to a fixed workspace key.
  if (email && configuredEmail && config.ownerId && email === configuredEmail) return `owner:${config.ownerId}`;
  return request.headers.get('oai-authenticated-user-id')?.trim() || (development ? 'local-preview-user' : '');
}
