import { z } from 'zod';
import { badRequest } from './respond';

export const gameTypeSchema = z.enum(['POP_GERAIS', 'TEMATICA', 'DECADAS']);

export const newGameSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório.'),
  date: z.string().trim().min(1, 'Data é obrigatória.'),
  location: z.string().trim().min(1, 'Local é obrigatório.'),
  description: z.string().trim().optional(),
  gameType: gameTypeSchema,
  rounds: z.number().int().min(1, 'Quantidade de rodadas deve ser >= 1.'),
  questionsPerRound: z.number().int().min(1, 'Perguntas por rodada deve ser >= 1.'),
});

export const updateGameSchema = newGameSchema.partial();

export const newTeamSchema = z.object({
  name: z.string().trim().min(1, 'Nome da equipe é obrigatório.'),
  playersCount: z.number().int().min(0, 'Quantidade de jogadores inválida.'),
  order: z.number().int().min(1).optional(),
});

export const updateTeamSchema = newTeamSchema.partial();

const teamScoreInputSchema = z.object({
  teamId: z.string().min(1),
  baseScore: z.number(),
  bonus: z.number(),
  penalty: z.number(),
});

export const submitScoresSchema = z.object({
  round: z.number().int().min(1),
  question: z.number().int().min(1),
  scores: z.array(teamScoreInputSchema).min(1, 'Informe ao menos uma equipe.'),
});

export const correctScoreSchema = z.object({
  baseScore: z.number(),
  bonus: z.number(),
  penalty: z.number(),
});

export const googleLoginSchema = z.object({
  idToken: z.string().min(1, 'idToken é obrigatório.'),
});

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw badRequest('Payload inválido.', result.error.flatten());
  }
  return result.data;
}
