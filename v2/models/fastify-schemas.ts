import { rCca } from "@/v2/models/cca/cca";
import { rCcaInfo } from "@/v2/models/cca/ccaInfo";
import { rCcaSignup } from "@/v2/models/cca/ccaSignup";
import { rCcaSubcommittee } from "@/v2/models/cca/ccaSubcommittee";
import { rHall } from "@/v2/models/hall";
import { rIhgMatch } from "@/v2/models/ihgMatch";
import { rIhgPlacement } from "@/v2/models/ihgPlacement";
import { rIhgPoint } from "@/v2/models/ihgPoint";
import { rIhgSport } from "@/v2/models/ihgSport";
import { rJersey } from "@/v2/models/jersey/jersey";
import { rJerseyBid } from "@/v2/models/jersey/jerseyBid";
import { rJerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { rMember } from "@/v2/models/jersey/member";
import { rTeam } from "@/v2/models/jersey/team";
import { rRoom } from "@/v2/models/room";
import { rRoomBid } from "@/v2/models/roomBid";
import { rRoomBidInfo } from "@/v2/models/roomBidInfo";
import { rRoomBlock } from "@/v2/models/roomBlock";

/* eslint-disable global-require */
import { rUser } from "@/v2/models/user";
import type { FastifyInstance } from "fastify";

async function addSchemas(fastify: FastifyInstance) {
  await fastify.addSchema(rUser);
  await fastify.addSchema(rTeam);
  await fastify.addSchema(rMember);
  await fastify.addSchema(rJerseyBidInfo);
  await fastify.addSchema(rJersey);
  await fastify.addSchema(rJerseyBid);
  await fastify.addSchema(rCcaSubcommittee);
  await fastify.addSchema(rCca);
  await fastify.addSchema(rCcaInfo);
  await fastify.addSchema(rCcaSignup);
  await fastify.addSchema(rHall);
  await fastify.addSchema(rIhgMatch);
  await fastify.addSchema(rIhgPoint);
  await fastify.addSchema(rIhgSport);
  await fastify.addSchema(rIhgPlacement);
  await fastify.addSchema(rRoom);
  await fastify.addSchema(rRoomBidInfo);
  await fastify.addSchema(rRoomBid);
  await fastify.addSchema(rRoomBlock);
}

export { addSchemas };
