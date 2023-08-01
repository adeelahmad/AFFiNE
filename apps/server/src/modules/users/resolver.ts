import { BadRequestException } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import type { User } from '@prisma/client';
// @ts-expect-error graphql-upload is not typed
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';

import { PrismaService } from '../../prisma/service';
import type { FileUpload } from '../../types';
import { Auth, CurrentUser, Public } from '../auth/guard';
import { StorageService } from '../storage/storage.service';

@ObjectType()
export class UserType implements Partial<User> {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'User name' })
  name!: string;

  @Field({ description: 'User email' })
  email!: string;

  @Field({ description: 'User avatar url', nullable: true })
  avatarUrl!: string;

  @Field({ description: 'User email verified', nullable: true })
  emailVerified!: Date;

  @Field({ description: 'User created date', nullable: true })
  createdAt!: Date;

  @Field({ description: 'User password has been set', nullable: true })
  hasPassword!: boolean;
}

@ObjectType()
export class DeleteAccount {
  @Field()
  success!: boolean;
}

@Auth()
@Resolver(() => UserType)
export class UserResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  @Query(() => UserType, {
    name: 'currentUser',
    description: 'Get current user',
  })
  async currentUser(@CurrentUser() user: User) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      hasPassword: !!user.password,
    };
  }

  @Query(() => UserType, {
    name: 'user',
    description: 'Get user by email',
    nullable: true,
  })
  @Public()
  async user(@Args('email') email: string) {
    // TODO: need to limit a user can only get another user witch is in the same workspace
    return this.prisma.user
      .findUnique({
        where: { email },
      })
      .catch(() => {
        return null;
      });
  }

  @Mutation(() => UserType, {
    name: 'uploadAvatar',
    description: 'Upload user avatar',
  })
  async uploadAvatar(
    @Args('id') id: string,
    @Args({ name: 'avatar', type: () => GraphQLUpload })
    avatar: FileUpload
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new BadRequestException(`User ${id} not found`);
    }
    const url = await this.storage.uploadFile(`${id}-avatar`, avatar);
    return this.prisma.user.update({
      where: { id },
      data: { avatarUrl: url },
    });
  }

  @Mutation(() => UserType, {
    name: 'updateUser',
    description: 'Upload user avatar',
  })
  async updateUser(
    @Args({ name: 'id', nullable: true }) id: string,
    @Args({ name: 'name', nullable: true }) name?: string,
    @Args({ name: 'password', nullable: true }) password?: string,
    @Args({ name: 'email', nullable: true }) email?: string,
    @Args({ name: 'avatar', type: () => GraphQLUpload, nullable: true })
    avatar?: FileUpload
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new BadRequestException(`User ${id} not found`);
    }
    if (!name && !avatar && !password && !email) {
      return user;
    }
    let url;
    if (avatar) {
      url = await this.storage.uploadFile(`${id}-avatar`, avatar);
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        avatarUrl: url ? url : user.avatarUrl,
        name: name ? name : user.name,
        password: password ? password : user.password,
        email: email ? email : user.email,
      },
    });
  }

  @Mutation(() => DeleteAccount)
  async deleteAccount(@CurrentUser() user: UserType): Promise<DeleteAccount> {
    await this.prisma.user.delete({
      where: {
        id: user.id,
      },
    });
    await this.prisma.session.deleteMany({
      where: {
        userId: user.id,
      },
    });
    return {
      success: true,
    };
  }
}
