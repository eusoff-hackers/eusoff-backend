import { rBid } from "@/v2/models/bid";
import { rBiddingInfo } from "@/v2/models/biddingInfo";
import { rCca } from "@/v2/models/cca";
import { rCcaInfo } from "@/v2/models/ccaInfo";
import { rCcaSignup } from "@/v2/models/ccaSignup";
import { rHall } from "@/v2/models/hall";
import { rIhgMatch } from "@/v2/models/ihgMatch";
import { rIhgPlacement } from "@/v2/models/ihgPlacement";
import { rIhgPoint } from "@/v2/models/ihgPoint";
import { rIhgSport } from "@/v2/models/ihgSport";
import { rJersey } from "@/v2/models/jersey";
import { rRoom } from "@/v2/models/room";
import { rRoomBid } from "@/v2/models/roomBid";
import { rRoomBidInfo } from "@/v2/models/roomBidInfo";
import { rRoomBlock } from "@/v2/models/roomBlock";
import { rTeam } from "@/v2/models/team";

/* eslint-disable global-require */
import { rUser } from "@/v2/models/user";
import type { FastifyInstance } from "fastify";

async function addSchemas(fastify: FastifyInstance) {
  await fastify.addSchema(rUser);
  await fastify.addSchema(rTeam);
  await fastify.addSchema(rBiddingInfo);
  await fastify.addSchema(rJersey);
  await fastify.addSchema(rBid);
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
