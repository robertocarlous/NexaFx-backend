import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../auth/decorators/current-user.decorator';
import { ReferralHistoryQueryDto } from './dto/referral-history.dto';
import { ReferralMeResponseDto } from './dto/referral-me.dto';
import { V2ReferralsService } from './referrals.service';

@ApiTags('Referrals V2')
@ApiBearerAuth('access-token')
@Controller('referrals')
export class V2ReferralsController {
  constructor(private readonly referralsService: V2ReferralsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get referral code, totals, and rewards earned' })
  @ApiResponse({ status: 200, type: ReferralMeResponseDto })
  getMe(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ReferralMeResponseDto> {
    return this.referralsService.getMyReferrals(user.userId);
  }

  @Get('me/history')
  @ApiOperation({ summary: 'Paginated list of rewarded referrals' })
  getHistory(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ReferralHistoryQueryDto,
  ) {
    return this.referralsService.getReferralHistory(user.userId, query);
  }
}
