import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AuthService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reaproveita a checagem em andamento em vez de duplicar a requisição a /api/auth/me', async () => {
    const user = { email: 'a@b.com', name: 'A', picture: null };

    // App e authGuard podem chamar checkSession() quase ao mesmo tempo no
    // boot — só deve sair uma requisição.
    const first = service.checkSession();
    const second = service.checkSession();

    const req = httpMock.expectOne('/api/auth/me');
    req.flush({ user });

    expect(await first).toEqual(user);
    expect(await second).toEqual(user);
  });

  it('faz uma requisição nova quando a anterior já terminou', async () => {
    const user = { email: 'a@b.com', name: 'A', picture: null };

    const first = service.checkSession();
    httpMock.expectOne('/api/auth/me').flush({ user });
    await first;

    const second = service.checkSession();
    httpMock.expectOne('/api/auth/me').flush({ user });
    expect(await second).toEqual(user);
  });
});
