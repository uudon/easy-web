export const adminDraftRecoveryPrefix = 'easy-web:admin-draft:'

export function adminDraftRecoveryKey(id: string) {
  return `${adminDraftRecoveryPrefix}${id}`
}

export function clearAdminDraftRecoveries(storage: Pick<Storage, 'key' | 'length' | 'removeItem'>) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
  keys.forEach((key) => {
    if (key?.startsWith(adminDraftRecoveryPrefix)) storage.removeItem(key)
  })
}
