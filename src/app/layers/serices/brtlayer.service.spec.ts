import { TestBed } from '@angular/core/testing';

import { BrtlayerService } from './brtlayer.service';

describe('BrtlayerService', () => {
  let service: BrtlayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BrtlayerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
