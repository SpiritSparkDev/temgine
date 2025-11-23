import { prisma } from '../../lib/prisma'
import handler from '../../lib/snippetsHandler.cjs'

export default async function handlerWrapper(req, res) {
  return handler(req, res, prisma)
}
