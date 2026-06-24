import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycRecord, KycStatus } from '../entities/kyc.entity';

@Injectable()
export class KycGuard implements CanActivate {
  constructor(
    @InjectRepository(KycRecord)
    private readonly kycRepository: Repository<KycRecord>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: { userId?: string };
    }>();
    const userId = request.user?.userId;

    if (!userId) {
      throw new ForbiddenException('KYC approval required');
    }

    const approvedKyc = await this.kycRepository.findOne({
      where: { userId, status: KycStatus.APPROVED },
      order: { reviewedAt: 'DESC' },
    });

    if (!approvedKyc) {
      throw new ForbiddenException('KYC approval required');
    }

    return true;
  }
}
